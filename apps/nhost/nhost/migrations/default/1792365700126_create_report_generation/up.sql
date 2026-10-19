-- Report generation (spec §8.3 run_report_schedules, §8.4 render_report, §8.5 generate_incident_report).
-- Backend-only functions (admin secret; roles []), called by the render_report trigger / run_report_schedules cron:
--   claim_report(report)                  queued, or generating with an expired lease -> generating, attempts + 1,
--                                          lease 5 minutes; out of attempts (3) -> failed 'max_attempts'.
--   compute_report(report, attempt)       the claimed attempt only: report_metrics replaced, dataset returned
--                                          ({title, code, report_type, period, generated_at, summary, columns,
--                                          rows (at most 10000; truncated), truncated}).
--   complete_report(report, attempt, file, summary)
--                                          the claimed attempt only (else no row: the caller deletes its file):
--                                          completed + file; event report_generated (emit_event, dedup per report);
--                                          incident reports log `report_generated` on the incident; schedule reports
--                                          get one delivery per member of the schedule's recipient group on the
--                                          schedule's channel (email pending -> send_delivery, in_app delivered +
--                                          inbox); then Stage C of the event (rules, subscriptions, webhooks).
--                                          Lock order: report row -> event key -> report deliveries -> Stage C.
--   fail_report(report, attempt, error)    the claimed attempt only -> failed with the error.
--   due_reports(at, limit)                 queued reports the trigger left for over a minute, expired leases.
--   init_report_schedule(schedule, next)   first next_run_at of an active schedule (computed by the backend).
--   run_report_schedule(schedule, run_at, next)
--                                          only while next_run_at = run_at (a retried / concurrent cron run is a
--                                          no-op): report for the previous complete period before run_at in the
--                                          schedule timezone (template parameters.period), one per schedule and
--                                          period; last_run_at = run_at, next_run_at = next.
-- org_admin mutations: retry_report(report) failed -> queued (attempts reset), generate_incident_report(incident,
-- format) inserts an incident report (no period).
CREATE TABLE itap_results.report_datasets (
  organization_id uuid NOT NULL,
  report_id uuid NOT NULL,
  dataset jsonb NOT NULL
);

CREATE FUNCTION itap.report_max_attempts() RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT 3 $$;

CREATE FUNCTION itap.claim_report(p_report uuid) RETURNS SETOF itap.reports
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  r itap.reports;
BEGIN
  SELECT * INTO r FROM itap.reports x
  WHERE x.id = p_report AND (x.status = 'queued' OR (x.status = 'generating' AND x.lease_expires_at <= now()))
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF r.attempts >= itap.report_max_attempts() THEN
    UPDATE itap.reports SET status = 'failed', error = 'max_attempts', lease_expires_at = NULL WHERE id = r.id;
    RETURN;
  END IF;
  UPDATE itap.reports
  SET status = 'generating', attempts = attempts + 1, lease_expires_at = now() + interval '5 minutes', error = NULL
  WHERE id = r.id
  RETURNING * INTO r;
  RETURN NEXT r;
END;
$$;

CREATE FUNCTION itap.compute_report(p_report uuid, p_attempt integer) RETURNS SETOF itap_results.report_datasets
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

CREATE FUNCTION itap.fail_report(p_report uuid, p_attempt integer, p_error text) RETURNS SETOF itap.reports
LANGUAGE sql VOLATILE
SET search_path = pg_catalog, itap
AS $$
  UPDATE itap.reports
  SET status = 'failed', error = left(coalesce(nullif(btrim(p_error), ''), 'unknown_error'), 1000),
      lease_expires_at = NULL
  WHERE id = p_report AND status = 'generating' AND attempts = p_attempt
  RETURNING *;
$$;

CREATE FUNCTION itap.due_reports(p_at timestamptz, p_limit integer) RETURNS SETOF itap.reports
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT * FROM itap.reports r
  WHERE r.status IN ('queued', 'generating')
    AND ((r.status = 'queued' AND r.updated_at <= p_at - interval '60 seconds')
         OR (r.status = 'generating' AND r.lease_expires_at <= p_at))
  ORDER BY r.updated_at, r.id
  LIMIT greatest(p_limit, 0);
$$;

CREATE FUNCTION itap.retry_report(hasura_session json, p_report uuid) RETURNS SETOF itap.reports
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  r itap.reports;
BEGIN
  SELECT * INTO r FROM itap.reports WHERE organization_id = org AND id = p_report FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('report_not_found');
  END IF;
  IF r.status <> 'failed' THEN
    PERFORM itap.raise_code('report_not_failed');
  END IF;
  UPDATE itap.reports SET status = 'queued', attempts = 0, error = NULL, lease_expires_at = NULL
  WHERE organization_id = org AND id = p_report;
  RETURN QUERY SELECT * FROM itap.reports WHERE organization_id = org AND id = p_report;
END;
$$;

CREATE FUNCTION itap.generate_incident_report(hasura_session json, p_incident uuid, p_format text DEFAULT 'pdf')
RETURNS SETOF itap.reports
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid;
  i itap.incidents;
BEGIN
  SELECT * INTO i FROM itap.incidents WHERE organization_id = org AND id = p_incident;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('incident_not_found');
  END IF;
  SELECT m.user_id INTO actor FROM itap.organization_members m
  WHERE m.organization_id = org AND m.user_id::text = hasura_session ->> 'x-hasura-user-id';
  RETURN QUERY
  INSERT INTO itap.reports (organization_id, report_type, title, incident_id, format, created_by)
  VALUES (org, 'incident', left('Incident report ' || i.code || ': ' || i.title, 300), i.id, coalesce(p_format, 'pdf'), actor)
  RETURNING *;
END;
$$;
