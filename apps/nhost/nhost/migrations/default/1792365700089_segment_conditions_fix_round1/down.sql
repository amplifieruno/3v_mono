-- Restores the definitions of *_create_segment_field_catalog / *_create_segment_condition_validation.
CREATE OR REPLACE FUNCTION itap.segment_field_catalog(p_target text, p_org uuid DEFAULT NULL)
RETURNS TABLE (field text, value_type text, operators text[], enum_values text[], label text)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH fields (target, field, value_type, nullable, enum_table, label) AS (
    VALUES
      ('profiles', 'first_name', 'text', false, NULL, 'First name'),
      ('profiles', 'last_name', 'text', false, NULL, 'Last name'),
      ('profiles', 'email', 'text', true, NULL, 'Email'),
      ('profiles', 'employee_id', 'text', true, NULL, 'Employee ID'),
      ('profiles', 'department', 'text', true, NULL, 'Department'),
      ('profiles', 'job_title', 'text', true, NULL, 'Job title'),
      ('profiles', 'profile_type', 'enum', false, 'profile_types', 'Profile type'),
      ('profiles', 'status', 'enum', false, 'profile_statuses', 'Status'),
      ('profiles', 'access_level', 'enum', false, 'access_levels', 'Access level'),
      ('profiles', 'company_id', 'company', true, NULL, 'Company'),
      ('profiles', 'start_date', 'date', true, NULL, 'Start date'),
      ('profiles', 'end_date', 'date', true, NULL, 'End date'),
      ('profiles', 'work_schedule_id', 'work_schedule', true, NULL, 'Work schedule'),
      ('profiles', 'on_shift_now', 'boolean', false, NULL, 'On shift now (work schedule)'),
      ('profiles', 'has_face', 'boolean', false, NULL, 'Has a linked face'),
      ('profiles', 'is_blacklisted', 'boolean', false, NULL, 'Blacklisted'),
      ('profiles', 'visit_status_today', 'enum', true, 'visit_statuses', 'Visit status today (as visitor)'),
      ('profiles', 'member_of_segment', 'segment', false, NULL, 'Member of segment'),
      ('identities', 'status', 'enum', false, 'identity_statuses', 'Status'),
      ('identities', 'attributes.age', 'integer', true, NULL, 'Estimated age'),
      ('identities', 'attributes.gender', 'text', true, NULL, 'Estimated gender'),
      ('identities', 'first_seen_at', 'timestamp', true, NULL, 'First seen'),
      ('identities', 'detection_count', 'integer', false, NULL, 'Detections'),
      ('identities', 'linked', 'boolean', false, NULL, 'Linked to a profile'),
      ('identities', 'member_of_segment', 'segment', false, NULL, 'Member of segment'),
      ('*', 'visits_last_30d', 'integer', true, NULL, 'Visits (30 days)'),
      ('*', 'avg_dwell_minutes', 'number', true, NULL, 'Average visit length, minutes (30 days)'),
      ('*', 'last_seen_days_ago', 'integer', true, NULL, 'Days since last seen'),
      ('*', 'after_hours_visits_30d', 'integer', true, NULL, 'After-hours visits (30 days)'),
      ('*', 'visited_area_id', 'area', false, NULL, 'Visited area (30 days)')
  )
  SELECT f.field, f.value_type, itap.segment_operators(f.value_type, f.nullable),
         CASE f.enum_table
           WHEN 'profile_types' THEN (SELECT array_agg(value ORDER BY value) FROM itap.profile_types)
           WHEN 'profile_statuses' THEN (SELECT array_agg(value ORDER BY value) FROM itap.profile_statuses)
           WHEN 'access_levels' THEN (SELECT array_agg(value ORDER BY value) FROM itap.access_levels)
           WHEN 'visit_statuses' THEN (SELECT array_agg(value ORDER BY value) FROM itap.visit_statuses)
           WHEN 'identity_statuses' THEN (SELECT array_agg(value ORDER BY value) FROM itap.identity_statuses)
         END,
         f.label
  FROM fields f
  WHERE f.target IN (p_target, '*') AND p_target IN ('identities', 'profiles')
  UNION ALL
  SELECT 'custom_fields.' || d.key,
         CASE d.data_type WHEN 'string' THEN 'text' ELSE d.data_type END,
         itap.segment_operators(CASE d.data_type WHEN 'string' THEN 'text' ELSE d.data_type END, true),
         CASE WHEN d.data_type = 'enum' THEN ARRAY(SELECT jsonb_array_elements_text(d.options)) END,
         d.label
  FROM itap.custom_attribute_definitions d
  WHERE p_target = 'profiles' AND d.organization_id = p_org AND d.entity = 'profile' AND d.is_active;
$$;

CREATE OR REPLACE FUNCTION itap.segment_value_valid(p_type text, v jsonb, p_enum text[]) RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  t constant text := jsonb_typeof(v);
BEGIN
  IF p_type IN ('date', 'timestamp') AND t = 'object' THEN
    IF (SELECT array_agg(k) FROM jsonb_object_keys(v) k) IS DISTINCT FROM ARRAY['relative_days']
       OR jsonb_typeof(v -> 'relative_days') <> 'number' THEN
      RETURN false;
    END IF;
    RETURN (v ->> 'relative_days')::numeric = trunc((v ->> 'relative_days')::numeric);
  END IF;
  CASE p_type
    WHEN 'boolean' THEN RETURN t = 'boolean';
    WHEN 'number' THEN RETURN t = 'number';
    WHEN 'integer' THEN
      IF t <> 'number' THEN RETURN false; END IF;
      RETURN (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric);
    ELSE
      IF t <> 'string' THEN RETURN false; END IF;
  END CASE;
  CASE p_type
    WHEN 'text' THEN RETURN btrim(v #>> '{}') <> '';
    WHEN 'enum' THEN RETURN (v #>> '{}') = ANY (p_enum);
    WHEN 'date' THEN RETURN itap.is_valid_date(v #>> '{}');
    WHEN 'timestamp' THEN
      IF (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}' THEN RETURN false; END IF;
      BEGIN
        PERFORM (v #>> '{}')::timestamptz;
        RETURN true;
      EXCEPTION WHEN OTHERS THEN
        RETURN false;
      END;
    ELSE -- company, work_schedule, area, segment: a uuid (existence: itap.segment_reference_valid)
      RETURN (v #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION itap.validate_segment_node(
  p_org uuid, p_target text, p_self uuid, p_catalog jsonb, p_node jsonb, p_path text, p_depth integer
) RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  bad constant text := 'segment_condition_invalid:';
  keys text[];
  spec jsonb;
  vtype text;
  enum_values text[];
  op text;
  v jsonb;
  i integer;
  low numeric;
  high numeric;
BEGIN
  IF jsonb_typeof(p_node) IS DISTINCT FROM 'object' OR p_depth > 7 THEN
    PERFORM itap.raise_code(bad || p_path);
  END IF;
  SELECT array_agg(k ORDER BY k) INTO keys FROM jsonb_object_keys(p_node) k;
  IF p_node ? 'op' THEN
    IF keys IS DISTINCT FROM ARRAY['children', 'op'] THEN
      PERFORM itap.raise_code(bad || p_path);
    END IF;
    IF jsonb_typeof(p_node -> 'op') <> 'string' OR (p_node ->> 'op') NOT IN ('and', 'or', 'not') THEN
      PERFORM itap.raise_code(bad || p_path || '.op');
    END IF;
    IF jsonb_typeof(p_node -> 'children') <> 'array' THEN
      PERFORM itap.raise_code(bad || p_path || '.children');
    END IF;
    IF jsonb_array_length(p_node -> 'children') = 0
       OR (p_node ->> 'op' = 'not' AND jsonb_array_length(p_node -> 'children') <> 1) THEN
      PERFORM itap.raise_code(bad || p_path || '.children');
    END IF;
    FOR i IN 0 .. jsonb_array_length(p_node -> 'children') - 1 LOOP
      PERFORM itap.validate_segment_node(
        p_org, p_target, p_self, p_catalog, p_node -> 'children' -> i, p_path || '.children[' || i || ']', p_depth + 1
      );
    END LOOP;
    RETURN;
  END IF;

  IF keys IS DISTINCT FROM ARRAY['field', 'operator', 'value'] THEN
    PERFORM itap.raise_code(bad || p_path);
  END IF;
  spec := CASE WHEN jsonb_typeof(p_node -> 'field') = 'string' THEN p_catalog -> (p_node ->> 'field') END;
  IF spec IS NULL THEN
    PERFORM itap.raise_code(bad || p_path || '.field');
  END IF;
  vtype := spec ->> 'type';
  enum_values := CASE WHEN jsonb_typeof(spec -> 'enum') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(spec -> 'enum')) END;
  op := CASE WHEN jsonb_typeof(p_node -> 'operator') = 'string' THEN p_node ->> 'operator' END;
  IF op IS NULL OR NOT (spec -> 'operators') ? op THEN
    PERFORM itap.raise_code(bad || p_path || '.operator');
  END IF;
  v := p_node -> 'value';

  IF op = 'is_null' THEN
    IF jsonb_typeof(v) <> 'boolean' THEN
      PERFORM itap.raise_code(bad || p_path || '.value');
    END IF;
  ELSIF op IN ('in', 'nin') THEN
    IF jsonb_typeof(v) <> 'array' THEN
      PERFORM itap.raise_code(bad || p_path || '.value');
    END IF;
    IF jsonb_array_length(v) = 0 THEN
      PERFORM itap.raise_code(bad || p_path || '.value');
    END IF;
    FOR i IN 0 .. jsonb_array_length(v) - 1 LOOP
      IF NOT itap.segment_value_valid(vtype, v -> i, enum_values) THEN
        PERFORM itap.raise_code(bad || p_path || '.value[' || i || ']');
      END IF;
      IF NOT itap.segment_reference_valid(p_org, p_target, p_self, vtype, v -> i) THEN
        PERFORM itap.raise_code(bad || p_path || '.value[' || i || ']');
      END IF;
    END LOOP;
  ELSIF op = 'between' THEN
    IF jsonb_typeof(v) <> 'array' THEN
      PERFORM itap.raise_code(bad || p_path || '.value');
    END IF;
    IF jsonb_array_length(v) <> 2 THEN
      PERFORM itap.raise_code(bad || p_path || '.value');
    END IF;
    IF NOT itap.segment_value_valid(vtype, v -> 0, enum_values) OR NOT itap.segment_value_valid(vtype, v -> 1, enum_values) THEN
      PERFORM itap.raise_code(bad || p_path || '.value');
    END IF;
    low := coalesce(itap.segment_value_key(vtype, v -> 0), (v -> 0 ->> 'relative_days')::numeric);
    high := coalesce(itap.segment_value_key(vtype, v -> 1), (v -> 1 ->> 'relative_days')::numeric);
    IF (jsonb_typeof(v -> 0) = 'object') = (jsonb_typeof(v -> 1) = 'object') AND low > high THEN
      PERFORM itap.raise_code(bad || p_path || '.value');
    END IF;
  ELSE
    IF NOT itap.segment_value_valid(vtype, v, enum_values) THEN
      PERFORM itap.raise_code(bad || p_path || '.value');
    END IF;
    IF NOT itap.segment_reference_valid(p_org, p_target, p_self, vtype, v) THEN
      PERFORM itap.raise_code(bad || p_path || '.value');
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION itap.segments_validate_conditions() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF NEW.kind = 'dynamic' AND NEW.conditions IS DISTINCT FROM '{}'::jsonb THEN
    PERFORM itap.validate_segment_conditions(NEW.organization_id, NEW.target, NEW.conditions, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION itap.segment_templates_validate_conditions() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  PERFORM itap.validate_segment_conditions(NEW.organization_id, NEW.target, NEW.conditions);
  RETURN NEW;
END;
$$;

DROP FUNCTION itap.lock_condition_segments(uuid, jsonb);
DROP FUNCTION itap.segment_path_operators(text);
