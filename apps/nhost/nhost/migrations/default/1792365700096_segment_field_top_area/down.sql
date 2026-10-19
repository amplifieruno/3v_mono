-- Restores visited_area_id (not nullable) in the catalog and in stored conditions (top_area_id is_null leaves would
-- no longer validate; none are expected in dev data).
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
      ('identities', 'age', 'integer', true, NULL, 'Estimated age (identities.age, from attributes.age)'),
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
  SELECT f.field, f.value_type,
         CASE WHEN f.field LIKE '%.%' THEN itap.segment_path_operators(f.value_type)
              ELSE itap.segment_operators(f.value_type, f.nullable) END,
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
         itap.segment_path_operators(CASE d.data_type WHEN 'string' THEN 'text' ELSE d.data_type END),
         CASE WHEN d.data_type = 'enum' THEN ARRAY(SELECT jsonb_array_elements_text(d.options)) END,
         d.label
  FROM itap.custom_attribute_definitions d
  WHERE p_target = 'profiles' AND d.organization_id = p_org AND d.entity = 'profile' AND d.is_active;
$$;

UPDATE itap.segment_templates SET conditions = replace(conditions::text, '"field": "top_area_id"', '"field": "visited_area_id"')::jsonb
WHERE conditions::text LIKE '%"field": "top_area_id"%';
UPDATE itap.segments SET conditions = replace(conditions::text, '"field": "top_area_id"', '"field": "visited_area_id"')::jsonb
WHERE conditions::text LIKE '%"field": "top_area_id"%';
