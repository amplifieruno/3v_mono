CREATE OR REPLACE FUNCTION itap.report_incident(c itap.report_context) RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH i AS (
    SELECT i.*, f.name AS facility, a.name AS area, u.email AS assignee
    FROM itap.incidents i
    LEFT JOIN itap.facilities f ON f.organization_id = i.organization_id AND f.id = i.facility_id
    LEFT JOIN itap.areas a ON a.organization_id = i.organization_id AND a.id = i.area_id
    LEFT JOIN auth.users u ON u.id = i.assigned_to
    WHERE i.organization_id = c.organization_id AND i.id = c.incident_id
  ), timeline AS (
    SELECT x.occurred_at AS at, x.kind, u.email AS actor,
           CASE WHEN x.details = '{}'::jsonb THEN '' ELSE x.details::text END AS details
    FROM itap.incident_activities x LEFT JOIN auth.users u ON u.id = x.actor_id
    WHERE x.organization_id = c.organization_id AND x.incident_id = c.incident_id AND x.kind <> 'note'
    UNION ALL
    SELECT n.created_at, 'note', u.email, n.body
    FROM itap.incident_notes n LEFT JOIN auth.users u ON u.id = n.author_id
    WHERE n.organization_id = c.organization_id AND n.incident_id = c.incident_id
    UNION ALL
    SELECT e.occurred_at, 'event', NULL, e.event_type || ': ' || e.title
    FROM itap.incident_events ie JOIN itap.events e ON e.organization_id = ie.organization_id AND e.id = ie.event_id
    WHERE ie.organization_id = c.organization_id AND ie.incident_id = c.incident_id
  )
  SELECT jsonb_build_object(
    'columns', jsonb_build_array('Time', 'Kind', 'Actor', 'Details'),
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_array(itap.report_time(at, c.timezone), kind, actor, details)
                                       ORDER BY at, kind, details) FROM timeline), '[]'::jsonb),
    'metrics', jsonb_build_array(
      itap.report_metric('events', 'count', (SELECT count(*) FROM timeline WHERE kind = 'event'), 'events'),
      itap.report_metric('notes', 'count', (SELECT count(*) FROM timeline WHERE kind = 'note'), 'notes'),
      itap.report_metric('activities', 'count', (SELECT count(*) FROM timeline WHERE kind NOT IN ('event', 'note')), 'activities'),
      itap.report_metric('minutes_to_acknowledge', 'average',
                         (SELECT extract(epoch FROM acknowledged_at - created_at) / 60 FROM i), 'minutes'),
      itap.report_metric('minutes_to_resolve', 'average',
                         (SELECT extract(epoch FROM resolved_at - created_at) / 60 FROM i), 'minutes')),
    'summary', (SELECT jsonb_agg(jsonb_build_object('label', k, 'value', v) ORDER BY n) FROM i, LATERAL (VALUES
      (1, 'Incident', i.code || ': ' || i.title), (2, 'Severity', i.severity), (3, 'Status', i.status),
      (4, 'Disposition', i.disposition), (5, 'Facility', i.facility), (6, 'Area', i.area),
      (7, 'Assigned to', i.assignee), (8, 'Opened', itap.report_time(i.created_at, c.timezone)),
      (9, 'Acknowledged', itap.report_time(i.acknowledged_at, c.timezone)),
      (10, 'Resolved', itap.report_time(i.resolved_at, c.timezone)), (11, 'Resolution', i.resolution)) s (n, k, v)));
$$;

DROP FUNCTION itap.report_details_text(jsonb);
DROP FUNCTION itap.report_user_name(uuid);
ALTER TABLE itap.report_templates DROP CONSTRAINT report_templates_timezone_valid;
ALTER TABLE itap.reports DROP CONSTRAINT reports_timezone_valid;
DROP TRIGGER report_segments_frozen ON itap.report_segments;
DROP TRIGGER report_facilities_frozen ON itap.report_facilities;
DROP FUNCTION itap.report_targets_frozen();
CREATE OR REPLACE FUNCTION itap.claim_report(p_report uuid) RETURNS SETOF itap.reports
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

CREATE OR REPLACE FUNCTION itap.retry_report(hasura_session json, p_report uuid) RETURNS SETOF itap.reports
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

DROP TRIGGER audit ON itap.reports;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.reports
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change(
    'ignore:status', 'ignore:file_id', 'ignore:summary', 'ignore:error', 'ignore:generated_at', 'ignore:attempts',
    'ignore:lease_expires_at');
ALTER TABLE itap.reports DROP CONSTRAINT reports_attempts_at_retry;
ALTER TABLE itap.reports DROP COLUMN attempts_at_retry;
CREATE OR REPLACE FUNCTION itap.init_report_schedule(p_schedule uuid, p_next_run_at timestamptz) RETURNS SETOF itap.report_schedules
LANGUAGE sql VOLATILE
SET search_path = pg_catalog, itap
AS $$
  UPDATE itap.report_schedules SET next_run_at = p_next_run_at
  WHERE id = p_schedule AND is_active AND next_run_at IS NULL
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION itap.run_report_schedule(p_schedule uuid, p_run_at timestamptz, p_next_run_at timestamptz)
RETURNS SETOF itap.reports
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  s itap.report_schedules;
  t itap.report_templates;
  p record;
  r itap.reports;
BEGIN
  SELECT * INTO s FROM itap.report_schedules WHERE id = p_schedule FOR UPDATE;
  IF NOT FOUND OR NOT s.is_active OR s.next_run_at IS DISTINCT FROM p_run_at THEN
    RETURN;
  END IF;
  SELECT * INTO t FROM itap.report_templates WHERE organization_id = s.organization_id AND id = s.template_id;
  SELECT * INTO p FROM itap.report_period(coalesce(t.parameters ->> 'period', 'previous_day'), s.timezone, p_run_at);
  INSERT INTO itap.reports (organization_id, report_type, title, parameters, start_date, end_date, format, template_id,
                            schedule_id)
  VALUES (s.organization_id, t.report_type,
          s.name || ' ' || to_char(p.start_date, 'YYYY-MM-DD')
            || CASE WHEN p.end_date <> p.start_date THEN ' - ' || to_char(p.end_date, 'YYYY-MM-DD') ELSE '' END,
          t.parameters || jsonb_build_object('timezone', s.timezone), p.start_date, p.end_date, t.format, t.id, s.id)
  ON CONFLICT (organization_id, schedule_id, start_date, end_date) WHERE schedule_id IS NOT NULL DO NOTHING
  RETURNING * INTO r;
  UPDATE itap.report_schedules SET last_run_at = p_run_at, next_run_at = p_next_run_at WHERE id = s.id;
  IF r.id IS NOT NULL THEN
    RETURN NEXT r;
  END IF;
END;
$$;

DROP FUNCTION itap.record_report_schedule_failure(uuid, timestamptz, timestamptz, text);
DROP TRIGGER audit ON itap.report_schedules;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.report_schedules
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change('ignore:last_run_at', 'ignore:next_run_at');
ALTER TABLE itap.report_schedules DROP COLUMN last_failed_at, DROP COLUMN last_error;
DROP TRIGGER report_templates_type_fixed ON itap.report_templates;
DROP FUNCTION itap.report_templates_type_fixed();
