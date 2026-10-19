-- Restores the definitions before 1792365700146 (from 1792365700139 / 1792365700138 and later fixes).
CREATE OR REPLACE FUNCTION itap.bulk_apply_profile_row(hasura_session json, p_job uuid, p_attempt integer, p_row_no integer, p_data jsonb)
 RETURNS SETOF itap.bulk_job_rows
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION itap.claim_bulk_job(p_job uuid)
 RETURNS SETOF itap.bulk_jobs
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  j itap.bulk_jobs;
BEGIN
  SELECT * INTO j FROM itap.bulk_jobs x
  WHERE x.id = p_job AND (x.status = 'queued' OR (x.status = 'running' AND x.lease_expires_at <= now()))
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF NOT itap.bulk_owner_active(j.organization_id, j.owner_id) THEN
    PERFORM itap.bulk_job_finish(j.id, 'failed', 'owner_inactive');
    RETURN;
  END IF;
  IF j.attempts - j.attempts_at_retry >= itap.bulk_job_max_attempts() THEN
    PERFORM itap.bulk_job_finish(j.id, 'failed', 'max_attempts');
    RETURN;
  END IF;
  RETURN QUERY
  UPDATE itap.bulk_jobs
  SET status = 'running', attempts = attempts + 1, lease_expires_at = now() + interval '2 minutes',
      started_at = coalesce(started_at, now()), error = NULL, completed_at = NULL
  WHERE id = j.id
  RETURNING *;
END;
$function$;
