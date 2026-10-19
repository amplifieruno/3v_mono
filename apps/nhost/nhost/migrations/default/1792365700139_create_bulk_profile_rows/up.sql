-- Profile rows of bulk jobs (slice 7 task 4): itap.bulk_apply_profile_row(hasura_session, job, attempt, row_no, data)
-- is an org_admin mutation the backend calls AS THE JOB OWNER (role org_admin, the owner's user and organization),
-- so the session organization scopes every lookup, the profile triggers (validate_custom_fields, numbering, audit with
-- the owner as actor) and CHECKs apply, and only the columns org_admin may write are written. It requires the claimed
-- attempt of a running job owned by the caller, and applies one input record in the same transaction as its
-- bulk_job_rows row (partial commit per row; idempotent on (job, row_no): a successful row is returned as is, a
-- failed row is applied again). A rejected record becomes a `failed` row with an error code (nothing of it is
-- committed): required:<col>, invalid_value:<col>, invalid_date:<col>, company_not_found, company_ambiguous,
-- work_schedule_not_found, work_schedule_ambiguous, custom_field_invalid:<key>, profile_not_found,
-- profile_key_ambiguous, constraint:<name>, or the database message. dry_run jobs apply the record inside a
-- subtransaction that is always rolled back: outcome `validated`.
-- data: {column: non-empty text} with the documented CSV columns (apps/backend/src/bulk/columns.ts); company = id
-- or name (case-insensitive), work_schedule = name; custom.<key> values are typed by the attribute definition
-- (number, boolean true/false/yes/no/1/0, else text). profile_update finds the profile by options.update_key
-- (employee_id exact, email case-insensitive, code exact), changes only the given columns (custom fields merged) and
-- never the key column.

-- Typed profile column values of a record (raises the row error codes above).
CREATE FUNCTION itap.bulk_profile_values(p_org uuid, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  result jsonb := '{}'::jsonb;
  custom jsonb := '{}'::jsonb;
  k text;
  v text;
  attr text;
  data_type text;
  ids uuid[];
BEGIN
  FOR k, v IN SELECT e.key, btrim(e.value) FROM jsonb_each_text(p_data) e WHERE btrim(e.value) <> '' LOOP
    IF k IN ('first_name', 'last_name', 'email', 'phone', 'department', 'job_title', 'employee_id') THEN
      result := result || jsonb_build_object(k, v);
    ELSIF k = 'profile_type' THEN
      IF NOT EXISTS (SELECT 1 FROM itap.profile_types t WHERE t.value = v) THEN
        PERFORM itap.raise_code('invalid_value:profile_type');
      END IF;
      result := result || jsonb_build_object(k, v);
    ELSIF k = 'access_level' THEN
      IF NOT EXISTS (SELECT 1 FROM itap.access_levels t WHERE t.value = v) THEN
        PERFORM itap.raise_code('invalid_value:access_level');
      END IF;
      result := result || jsonb_build_object(k, v);
    ELSIF k IN ('start_date', 'end_date') THEN
      IF NOT itap.is_valid_date(v) THEN
        PERFORM itap.raise_code('invalid_date:' || k);
      END IF;
      result := result || jsonb_build_object(k, v);
    ELSIF k = 'company' THEN
      SELECT array_agg(c.id ORDER BY c.id) INTO ids FROM itap.companies c
      WHERE c.organization_id = p_org AND ((v ~* uuid_re AND c.id = v::uuid) OR lower(c.name) = lower(v));
      IF ids IS NULL THEN
        PERFORM itap.raise_code('company_not_found');
      ELSIF cardinality(ids) > 1 THEN
        PERFORM itap.raise_code('company_ambiguous');
      END IF;
      result := result || jsonb_build_object('company_id', ids[1]);
    ELSIF k = 'work_schedule' THEN
      SELECT array_agg(w.id ORDER BY w.id) INTO ids FROM itap.work_schedules w
      WHERE w.organization_id = p_org AND lower(w.name) = lower(v);
      IF ids IS NULL THEN
        PERFORM itap.raise_code('work_schedule_not_found');
      ELSIF cardinality(ids) > 1 THEN
        PERFORM itap.raise_code('work_schedule_ambiguous');
      END IF;
      result := result || jsonb_build_object('work_schedule_id', ids[1]);
    ELSIF k LIKE 'custom.%' THEN
      attr := substr(k, 8);
      SELECT d.data_type INTO data_type FROM itap.custom_attribute_definitions d
      WHERE d.organization_id = p_org AND d.entity = 'profile' AND d.key = attr;
      IF data_type = 'number' THEN
        IF v !~ '^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$' THEN
          PERFORM itap.raise_code('custom_field_invalid:' || attr);
        END IF;
        custom := custom || jsonb_build_object(attr, v::numeric);
      ELSIF data_type = 'boolean' THEN
        IF lower(v) NOT IN ('true', 'false', 'yes', 'no', '1', '0') THEN
          PERFORM itap.raise_code('custom_field_invalid:' || attr);
        END IF;
        custom := custom || jsonb_build_object(attr, lower(v) IN ('true', 'yes', '1'));
      ELSE
        custom := custom || jsonb_build_object(attr, v);
      END IF;
    ELSE
      PERFORM itap.raise_code('unknown_column:' || k);
    END IF;
  END LOOP;
  IF custom <> '{}'::jsonb THEN
    result := result || jsonb_build_object('custom_fields', custom);
  END IF;
  RETURN result;
END;
$$;

CREATE FUNCTION itap.bulk_find_profile(p_org uuid, p_key text, p_value text) RETURNS uuid
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  ids uuid[];
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    PERFORM itap.raise_code('required:' || p_key);
  END IF;
  SELECT array_agg(p.id ORDER BY p.id) INTO ids FROM itap.profiles p
  WHERE p.organization_id = p_org
    AND CASE p_key
      WHEN 'employee_id' THEN p.employee_id = btrim(p_value)
      WHEN 'email' THEN lower(p.email) = lower(btrim(p_value))
      WHEN 'code' THEN p.code = upper(btrim(p_value))
      ELSE false
    END;
  IF ids IS NULL THEN
    PERFORM itap.raise_code('profile_not_found');
  ELSIF cardinality(ids) > 1 THEN
    PERFORM itap.raise_code('profile_key_ambiguous');
  END IF;
  RETURN ids[1];
END;
$$;

-- Error code of a rejected record.
CREATE FUNCTION itap.bulk_row_error(p_state text, p_message text, p_constraint text) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN coalesce(p_constraint, '') <> '' THEN 'constraint:' || p_constraint
    WHEN p_state = '23514' AND p_message !~ '\s' THEN p_message
    ELSE left(coalesce(p_message, 'unknown_error'), 500)
  END;
$$;

CREATE FUNCTION itap.bulk_apply_profile_row(
  hasura_session json, p_job uuid, p_attempt integer, p_row_no integer, p_data jsonb
) RETURNS SETOF itap.bulk_job_rows
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  caller uuid := itap.session_user_id(hasura_session);
  j itap.bulk_jobs := itap.bulk_job_for_row(org, p_job, p_attempt, p_row_no);
  existing itap.bulk_job_rows;
  r itap.bulk_job_rows;
  update_key text := coalesce(j.options ->> 'update_key', 'employee_id');
  dry boolean := coalesce((j.options ->> 'dry_run')::boolean, false);
  v jsonb;
  v_state text;
  v_message text;
  v_constraint text;
BEGIN
  IF j.kind NOT IN ('profile_import', 'profile_update') THEN
    PERFORM itap.raise_code('bulk_job_not_found');
  END IF;
  IF j.owner_id IS DISTINCT FROM caller THEN
    PERFORM itap.raise_code('bulk_job_not_owner');
  END IF;
  IF NOT itap.bulk_owner_active(org, j.owner_id) THEN
    PERFORM itap.raise_code('bulk_job_owner_inactive');
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    PERFORM itap.raise_code('bulk_row_data_invalid');
  END IF;
  SELECT * INTO existing FROM itap.bulk_job_rows x
  WHERE x.organization_id = org AND x.bulk_job_id = j.id AND x.row_no = p_row_no;
  IF FOUND AND existing.outcome <> 'failed' THEN
    RETURN NEXT existing;
    RETURN;
  END IF;

  r.organization_id := org;
  r.bulk_job_id := j.id;
  r.row_no := p_row_no;
  BEGIN
    IF j.kind = 'profile_import' THEN
      v := itap.bulk_profile_values(org, p_data);
      IF NOT v ? 'first_name' THEN
        PERFORM itap.raise_code('required:first_name');
      ELSIF NOT v ? 'last_name' THEN
        PERFORM itap.raise_code('required:last_name');
      END IF;
      INSERT INTO itap.profiles (organization_id, first_name, last_name, email, phone, profile_type, company_id,
                                 department, job_title, employee_id, start_date, end_date, access_level,
                                 work_schedule_id, custom_fields)
      VALUES (org, v ->> 'first_name', v ->> 'last_name', v ->> 'email', v ->> 'phone',
              coalesce(v ->> 'profile_type', 'employee'), (v ->> 'company_id')::uuid, v ->> 'department',
              v ->> 'job_title', v ->> 'employee_id', (v ->> 'start_date')::date, (v ->> 'end_date')::date,
              coalesce(v ->> 'access_level', 'basic'), (v ->> 'work_schedule_id')::uuid,
              coalesce(v -> 'custom_fields', '{}'::jsonb))
      RETURNING id, code INTO r.profile_id, r.entity_code;
      r.outcome := 'created';
    ELSE
      r.profile_id := itap.bulk_find_profile(org, update_key, p_data ->> update_key);
      v := itap.bulk_profile_values(org, p_data - update_key);
      UPDATE itap.profiles p
      SET first_name = coalesce(v ->> 'first_name', p.first_name),
          last_name = coalesce(v ->> 'last_name', p.last_name),
          email = coalesce(v ->> 'email', p.email),
          phone = coalesce(v ->> 'phone', p.phone),
          profile_type = coalesce(v ->> 'profile_type', p.profile_type),
          company_id = coalesce((v ->> 'company_id')::uuid, p.company_id),
          department = coalesce(v ->> 'department', p.department),
          job_title = coalesce(v ->> 'job_title', p.job_title),
          employee_id = coalesce(v ->> 'employee_id', p.employee_id),
          start_date = coalesce((v ->> 'start_date')::date, p.start_date),
          end_date = coalesce((v ->> 'end_date')::date, p.end_date),
          access_level = coalesce(v ->> 'access_level', p.access_level),
          work_schedule_id = coalesce((v ->> 'work_schedule_id')::uuid, p.work_schedule_id),
          custom_fields = p.custom_fields || coalesce(v -> 'custom_fields', '{}'::jsonb)
      WHERE p.organization_id = org AND p.id = r.profile_id
      RETURNING p.code INTO r.entity_code;
      r.outcome := 'updated';
    END IF;
    IF dry THEN
      RAISE EXCEPTION USING ERRCODE = 'BJ001', MESSAGE = 'bulk_dry_run';
    END IF;
  EXCEPTION
    WHEN SQLSTATE 'BJ001' THEN
      -- Dry run: everything above is rolled back; an import has no profile.
      r.outcome := 'validated';
      IF j.kind = 'profile_import' THEN
        r.profile_id := NULL;
        r.entity_code := NULL;
      END IF;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT, v_constraint = CONSTRAINT_NAME;
      r.outcome := 'failed';
      r.error := itap.bulk_row_error(v_state, v_message, v_constraint);
      IF j.kind = 'profile_import' THEN
        r.profile_id := NULL;
      END IF;
      r.entity_code := (SELECT p.code FROM itap.profiles p WHERE p.organization_id = org AND p.id = r.profile_id);
  END;
  RETURN QUERY SELECT * FROM itap.bulk_job_put_row(r);
END;
$$;
