-- Reports, fix round 1 (slice 7 task 2 review):
--   1. report_templates.report_type is fixed after insert (a scheduled template switched to `incident` would make
--      every run of its schedules fail). Schedule runs that fail are isolated by the cron: the error is recorded on
--      the schedule (last_error, last_failed_at; read-only, cleared by the next successful run) and the schedule moves
--      on to its next run (record_report_schedule_failure, guarded like run_report_schedule).
--   2. Attempt numbers are a monotonic fencing token: retry_report keeps `attempts` and records attempts_at_retry;
--      the out-of-attempts check counts attempts since the last retry, so a handler of a pre-retry attempt can never
--      complete or fail the new generation.
--   4. report_facilities / report_segments change only while their report is queued (frozen once generation started;
--      a report row deleted in the same statement, the organization cascade and itap.seed_context are exempt).
--   7. parameters.timezone must be a valid IANA timezone (reports, report_templates).
--   8. The incident report renders users as display name / email: the actor column and user ids inside activity
--      details (other ids in details are omitted).

-- 1.
CREATE FUNCTION itap.report_templates_type_fixed() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF NEW.report_type IS DISTINCT FROM OLD.report_type THEN
    PERFORM itap.raise_code('report_template_type_immutable');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER report_templates_type_fixed BEFORE UPDATE OF report_type ON itap.report_templates
  FOR EACH ROW EXECUTE FUNCTION itap.report_templates_type_fixed();

ALTER TABLE itap.report_schedules ADD COLUMN last_error text, ADD COLUMN last_failed_at timestamptz;
DROP TRIGGER audit ON itap.report_schedules;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.report_schedules
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change(
    'ignore:last_run_at', 'ignore:next_run_at', 'ignore:last_error', 'ignore:last_failed_at');

CREATE FUNCTION itap.record_report_schedule_failure(
  p_schedule uuid, p_run_at timestamptz, p_next_run_at timestamptz, p_error text
) RETURNS SETOF itap.report_schedules
LANGUAGE sql VOLATILE
SET search_path = pg_catalog, itap
AS $$
  UPDATE itap.report_schedules
  SET last_error = left(coalesce(nullif(btrim(p_error), ''), 'unknown_error'), 1000), last_failed_at = now(),
      next_run_at = p_next_run_at
  WHERE id = p_schedule AND is_active AND next_run_at IS NOT DISTINCT FROM p_run_at
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION itap.init_report_schedule(p_schedule uuid, p_next_run_at timestamptz) RETURNS SETOF itap.report_schedules
LANGUAGE sql VOLATILE
SET search_path = pg_catalog, itap
AS $$
  UPDATE itap.report_schedules SET next_run_at = p_next_run_at, last_error = NULL, last_failed_at = NULL
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
  UPDATE itap.report_schedules
  SET last_run_at = p_run_at, next_run_at = p_next_run_at, last_error = NULL, last_failed_at = NULL
  WHERE id = s.id;
  IF r.id IS NOT NULL THEN
    RETURN NEXT r;
  END IF;
END;
$$;

-- 2.
ALTER TABLE itap.reports ADD COLUMN attempts_at_retry integer NOT NULL DEFAULT 0;
ALTER TABLE itap.reports ADD CONSTRAINT reports_attempts_at_retry CHECK (attempts_at_retry BETWEEN 0 AND attempts);
DROP TRIGGER audit ON itap.reports;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.reports
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change(
    'ignore:status', 'ignore:file_id', 'ignore:summary', 'ignore:error', 'ignore:generated_at', 'ignore:attempts',
    'ignore:lease_expires_at', 'ignore:attempts_at_retry');

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
  IF r.attempts - r.attempts_at_retry >= itap.report_max_attempts() THEN
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
  UPDATE itap.reports SET status = 'queued', attempts_at_retry = attempts, error = NULL, lease_expires_at = NULL
  WHERE organization_id = org AND id = p_report;
  RETURN QUERY SELECT * FROM itap.reports WHERE organization_id = org AND id = p_report;
END;
$$;

-- 4.
CREATE FUNCTION itap.report_targets_frozen() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid;
  report uuid;
  report_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    org := OLD.organization_id;
    report := OLD.report_id;
  ELSE
    org := NEW.organization_id;
    report := NEW.report_id;
  END IF;
  IF NOT itap.seed_context() THEN
    SELECT r.status INTO report_status FROM itap.reports r WHERE r.organization_id = org AND r.id = report;
    -- Not found: the report (or its organization) is being deleted in this statement.
    IF FOUND AND report_status <> 'queued' THEN
      PERFORM itap.raise_code('report_targets_frozen');
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER report_facilities_frozen BEFORE INSERT OR UPDATE OR DELETE ON itap.report_facilities
  FOR EACH ROW EXECUTE FUNCTION itap.report_targets_frozen();
CREATE TRIGGER report_segments_frozen BEFORE INSERT OR UPDATE OR DELETE ON itap.report_segments
  FOR EACH ROW EXECUTE FUNCTION itap.report_targets_frozen();

-- 7.
ALTER TABLE itap.reports ADD CONSTRAINT reports_timezone_valid
  CHECK (NOT parameters ? 'timezone' OR itap.is_valid_timezone(parameters ->> 'timezone'));
ALTER TABLE itap.report_templates ADD CONSTRAINT report_templates_timezone_valid
  CHECK (NOT parameters ? 'timezone' OR itap.is_valid_timezone(parameters ->> 'timezone'));

-- 8.
CREATE FUNCTION itap.report_user_name(p_user uuid) RETURNS text
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(nullif(btrim(u.display_name), ''), u.email) FROM auth.users u WHERE u.id = p_user;
$$;

-- "key: value, ..." of activity details (keys sorted, nulls skipped); a uuid value is shown as the user's name when
-- it is a user, otherwise left out (internal ids).
CREATE FUNCTION itap.report_details_text(p_details jsonb) RETURNS text
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT coalesce(string_agg(d.key || ': ' || d.v, ', ' ORDER BY d.key), '')
  FROM (
    SELECT e.key,
           CASE
             WHEN jsonb_typeof(e.value) = 'string'
                  AND (e.value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               THEN itap.report_user_name((e.value #>> '{}')::uuid)
             WHEN jsonb_typeof(e.value) = 'string' THEN e.value #>> '{}'
             ELSE e.value::text
           END AS v
    FROM jsonb_each(coalesce(p_details, '{}'::jsonb)) e
    WHERE jsonb_typeof(e.value) <> 'null'
  ) d
  WHERE d.v IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION itap.report_incident(c itap.report_context) RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH i AS (
    SELECT i.*, f.name AS facility, a.name AS area, itap.report_user_name(i.assigned_to) AS assignee
    FROM itap.incidents i
    LEFT JOIN itap.facilities f ON f.organization_id = i.organization_id AND f.id = i.facility_id
    LEFT JOIN itap.areas a ON a.organization_id = i.organization_id AND a.id = i.area_id
    WHERE i.organization_id = c.organization_id AND i.id = c.incident_id
  ), timeline AS (
    SELECT x.occurred_at AS at, x.kind, itap.report_user_name(x.actor_id) AS actor,
           itap.report_details_text(x.details) AS details
    FROM itap.incident_activities x
    WHERE x.organization_id = c.organization_id AND x.incident_id = c.incident_id AND x.kind <> 'note'
    UNION ALL
    SELECT n.created_at, 'note', itap.report_user_name(n.author_id), n.body
    FROM itap.incident_notes n
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
