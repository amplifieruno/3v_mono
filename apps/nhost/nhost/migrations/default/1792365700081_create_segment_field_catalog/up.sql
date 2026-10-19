-- Segment condition language (spec §6.5, §6.0 "JSON exceptions that contain ids"). One catalog, one validator; the
-- only evaluator is the backend translator (conditions -> Hasura where), which reads the same catalog.
--
-- Tree: a group {"op": "and"|"or"|"not", "children": [node, ...]} (non-empty; "not" exactly one child) or a leaf
-- {"field": f, "operator": o, "value": v} (exactly these keys). At most 7 levels. Error code:
-- segment_condition_invalid:<path>, path in JSONPath style ($, $.children[1].value[0]).
--
-- Value types and operators (itap.segment_operators): text (eq neq in nin contains), enum (eq neq in nin; values from
-- enum_values), integer (eq neq in nin gt gte lt lte between), number (eq neq gt gte lt lte between), boolean (eq),
-- date (eq neq gt gte lt lte between; 'YYYY-MM-DD' or {"relative_days": n} = evaluation day + n),
-- timestamp (gt gte lt lte between; ISO timestamp or {"relative_days": n} = evaluation time + n days),
-- reference types company / work_schedule / area / segment (eq neq in nin; uuids of the organization; segment =
-- manual segment of the same target, never the segment itself, which rules out evaluation cycles).
-- Nullable fields also take is_null (value true = is null, false = is not null).
-- Scalar operators take one value, in/nin a non-empty array, between [low, high] (low <= high when comparable).
-- Behavioral metrics come from identity_activity_stats / profile_activity_stats: a subject without a stats row has
-- null metrics, and every comparison on them is false (is_null true matches).
-- A referenced company / work schedule / area deleted later matches nothing; a referenced segment cannot be deleted.

CREATE FUNCTION itap.segment_operators(p_type text, p_nullable boolean) RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_type
    WHEN 'text' THEN ARRAY['eq', 'neq', 'in', 'nin', 'contains']
    WHEN 'enum' THEN ARRAY['eq', 'neq', 'in', 'nin']
    WHEN 'integer' THEN ARRAY['eq', 'neq', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'between']
    WHEN 'number' THEN ARRAY['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between']
    WHEN 'boolean' THEN ARRAY['eq']
    WHEN 'date' THEN ARRAY['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between']
    WHEN 'timestamp' THEN ARRAY['gt', 'gte', 'lt', 'lte', 'between']
    ELSE ARRAY['eq', 'neq', 'in', 'nin'] -- company, work_schedule, area, segment
  END || CASE WHEN p_nullable THEN ARRAY['is_null'] ELSE ARRAY[]::text[] END;
$$;

-- The field catalog per target. With p_org, the organization's active custom fields (profiles) are included as
-- custom_fields.<key>. Read by the validator and (through the tracked segment_fields) by the backend translator / UI.
CREATE FUNCTION itap.segment_field_catalog(p_target text, p_org uuid DEFAULT NULL)
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

-- Row type of the tracked catalog query (stores nothing).
CREATE TABLE itap_results.segment_field_rows (
  organization_id uuid NOT NULL,
  target text NOT NULL,
  field text NOT NULL,
  value_type text NOT NULL,
  operators text[] NOT NULL,
  enum_values text[],
  label text NOT NULL
);

CREATE FUNCTION itap.segment_fields(hasura_session json, p_target text)
RETURNS SETOF itap_results.segment_field_rows
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org constant uuid := itap.session_organization(hasura_session);
BEGIN
  IF p_target IS NULL OR p_target NOT IN ('identities', 'profiles') THEN
    PERFORM itap.raise_code('segment_target_invalid');
  END IF;
  RETURN QUERY
  SELECT org, p_target, c.field, c.value_type, c.operators, c.enum_values, c.label
  FROM itap.segment_field_catalog(p_target, org) c;
END;
$$;

