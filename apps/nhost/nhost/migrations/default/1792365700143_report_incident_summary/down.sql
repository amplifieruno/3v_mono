-- Restores compute_report of 1792365700126_create_report_generation.
CREATE OR REPLACE FUNCTION itap.compute_report(p_report uuid, p_attempt integer) RETURNS SETOF itap_results.report_datasets
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  max_rows constant integer := 10000;
  r itap.reports;
  c itap.report_context;
  data jsonb;
  data_rows jsonb;
  truncated boolean := false;
  summary jsonb;
BEGIN
  SELECT * INTO r FROM itap.reports WHERE id = p_report;
  IF NOT FOUND OR r.status <> 'generating' OR r.attempts <> p_attempt THEN
    PERFORM itap.raise_code('report_not_claimed');
  END IF;
  c.organization_id := r.organization_id;
  c.report_id := r.id;
  c.timezone := coalesce(r.parameters ->> 'timezone',
                         (SELECT o.timezone FROM itap.organizations o WHERE o.id = r.organization_id), 'UTC');
  c.start_date := r.start_date;
  c.end_date := r.end_date;
  c.from_ts := r.start_date::timestamp AT TIME ZONE c.timezone;
  c.to_ts := (r.end_date + 1)::timestamp AT TIME ZONE c.timezone;
  SELECT coalesce(array_agg(x.facility_id ORDER BY x.facility_id), '{}') INTO c.facility_ids
  FROM itap.report_facilities x WHERE x.organization_id = r.organization_id AND x.report_id = r.id;
  c.facilities_explicit := cardinality(c.facility_ids) > 0;
  IF NOT c.facilities_explicit THEN
    SELECT coalesce(array_agg(f.id ORDER BY f.id), '{}') INTO c.facility_ids
    FROM itap.facilities f WHERE f.organization_id = r.organization_id;
  END IF;
  SELECT coalesce(array_agg(x.segment_id ORDER BY x.segment_id), '{}') INTO c.segment_ids
  FROM itap.report_segments x WHERE x.organization_id = r.organization_id AND x.report_id = r.id;
  c.incident_id := r.incident_id;

  data := CASE r.report_type
    WHEN 'flow' THEN itap.report_flow(c)
    WHEN 'occupancy' THEN itap.report_occupancy(c)
    WHEN 'heatmap' THEN itap.report_heatmap(c)
    WHEN 'behavior' THEN itap.report_behavior(c)
    WHEN 'attendance' THEN itap.report_attendance(c)
    WHEN 'segment' THEN itap.report_segment(c)
    WHEN 'compliance' THEN itap.report_compliance(c)
    WHEN 'device_health' THEN itap.report_device_health(c)
    WHEN 'incident' THEN itap.report_incident(c)
  END;
  IF data IS NULL THEN
    PERFORM itap.raise_code('report_type_unsupported');
  END IF;
  data_rows := coalesce(data -> 'rows', '[]'::jsonb);
  IF jsonb_array_length(data_rows) > max_rows THEN
    data_rows := jsonb_path_query_array(data_rows, ('$[0 to ' || (max_rows - 1) || ']')::jsonpath);
    truncated := true;
  END IF;

  DELETE FROM itap.report_metrics WHERE organization_id = r.organization_id AND report_id = r.id;
  INSERT INTO itap.report_metrics (organization_id, report_id, metric_name, metric_type, value, unit, category, dimension)
  SELECT r.organization_id, r.id, m ->> 'name', m ->> 'type', (m ->> 'value')::numeric, m ->> 'unit', m ->> 'category',
         coalesce(m -> 'dimension', '{}'::jsonb)
  FROM jsonb_array_elements(coalesce(data -> 'metrics', '[]'::jsonb)) m
  WHERE m ->> 'value' IS NOT NULL;

  -- Summary: the type's notes, then the report-wide metrics (those without a dimension) in their order.
  summary := coalesce(data -> 'summary', '[]'::jsonb) || coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'label', initcap(replace(m ->> 'name', '_', ' '))
                      || CASE WHEN m ->> 'unit' IN ('%', 'minutes', 'ms') THEN ' (' || (m ->> 'unit') || ')' ELSE '' END,
             'value', m -> 'value') ORDER BY n)
    FROM jsonb_array_elements(coalesce(data -> 'metrics', '[]'::jsonb)) WITH ORDINALITY AS x (m, n)
    WHERE m -> 'dimension' = '{}'::jsonb AND m ->> 'value' IS NOT NULL), '[]'::jsonb);

  RETURN QUERY SELECT r.organization_id, r.id, jsonb_build_object(
    'title', r.title,
    'code', r.code,
    'report_type', r.report_type,
    'period', jsonb_build_object('start_date', to_char(r.start_date, 'YYYY-MM-DD'),
                                 'end_date', to_char(r.end_date, 'YYYY-MM-DD'), 'timezone', c.timezone),
    'generated_at', itap.report_time(now(), c.timezone),
    'summary', summary,
    'columns', data -> 'columns',
    'rows', data_rows,
    'truncated', truncated);
END;
$$;

DROP FUNCTION itap.report_incident_summary(itap.report_context);
-- Rows of the removed type go first (schedules -> reports -> templates); report metrics and targets cascade, report
-- deliveries keep their log row (report_id SET NULL). Target freeze guards are disabled for the cascade, like
-- 1792365700062's down disables the delivery guard.
ALTER TABLE itap.report_facilities DISABLE TRIGGER report_facilities_frozen;
ALTER TABLE itap.report_segments DISABLE TRIGGER report_segments_frozen;
DELETE FROM itap.report_schedules s USING itap.report_templates t
WHERE t.organization_id = s.organization_id AND t.id = s.template_id AND t.report_type = 'incident_summary';
DELETE FROM itap.reports WHERE report_type = 'incident_summary';
DELETE FROM itap.report_templates WHERE report_type = 'incident_summary';
ALTER TABLE itap.report_facilities ENABLE TRIGGER report_facilities_frozen;
ALTER TABLE itap.report_segments ENABLE TRIGGER report_segments_frozen;
DELETE FROM itap.report_types WHERE value = 'incident_summary';
