-- Report data, part 2 (see part 1 for the shape).
--   segment:       segment_daily_stats of the report segments (none = every segment of the organization).
--   compliance:    audit_log entries of the period by action and entity, consent records by purpose and current
--                  status, consents granted / withdrawn in the period. Data subject requests and retention are not
--                  built yet (slice 10): the summary says so.
--   device_health: per device (report facilities; none = every device) health samples, errors and offline device
--                  events of the period, plus the current health status.
--   incident:      the incident (summary) and its timeline: activities (except note markers), notes with their text,
--                  linked events; times in the report timezone.

CREATE FUNCTION itap.report_segment(c itap.report_context) RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH segs AS (
    SELECT s.id, s.code, s.name FROM itap.segments s
    WHERE s.organization_id = c.organization_id
      AND (cardinality(c.segment_ids) = 0 OR s.id = ANY (c.segment_ids))
  ), d AS (
    SELECT segs.code, segs.name, x.day, x.member_count, x.added, x.removed
    FROM segs JOIN itap.segment_daily_stats x ON x.organization_id = c.organization_id AND x.segment_id = segs.id
    WHERE x.day BETWEEN c.start_date AND c.end_date
  ), per_segment AS (
    SELECT code, name, (array_agg(member_count ORDER BY day DESC))[1] AS members_end, sum(added) - sum(removed) AS net
    FROM d GROUP BY 1, 2
  )
  SELECT jsonb_build_object(
    'columns', jsonb_build_array('Segment', 'Name', 'Day', 'Members', 'Added', 'Removed'),
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_array(code, name, to_char(day, 'YYYY-MM-DD'), member_count, added, removed)
                                       ORDER BY name, code, day) FROM d), '[]'::jsonb),
    'metrics', jsonb_build_array(itap.report_metric('segments', 'count', (SELECT count(*) FROM segs), 'segments'))
      || coalesce((SELECT jsonb_agg(m ORDER BY m ->> 'name', m -> 'dimension' ->> 'segment') FROM (
           SELECT itap.report_metric('members_end', 'count', members_end, 'members', 'segment', jsonb_build_object('segment', name)) AS m
           FROM per_segment
           UNION ALL
           SELECT itap.report_metric('net_change', 'count', net, 'members', 'segment', jsonb_build_object('segment', name))
           FROM per_segment) x), '[]'::jsonb),
    'summary', '[]'::jsonb);
$$;

CREATE FUNCTION itap.report_compliance(c itap.report_context) RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH audit AS (
    SELECT a.action, coalesce(a.entity, '-') AS entity, count(*) AS n
    FROM itap.audit_log a
    WHERE a.organization_id = c.organization_id AND a.occurred_at >= c.from_ts AND a.occurred_at < c.to_ts
    GROUP BY 1, 2
  ), consents AS (
    SELECT r.purpose, r.status, count(*) AS n FROM itap.consent_records r
    WHERE r.organization_id = c.organization_id GROUP BY 1, 2
  ), changes AS (
    SELECT r.purpose, 'granted' AS change, count(*) AS n FROM itap.consent_records r
    WHERE r.organization_id = c.organization_id AND r.granted_at >= c.from_ts AND r.granted_at < c.to_ts GROUP BY 1
    UNION ALL
    SELECT r.purpose, 'withdrawn', count(*) FROM itap.consent_records r
    WHERE r.organization_id = c.organization_id AND r.withdrawn_at >= c.from_ts AND r.withdrawn_at < c.to_ts GROUP BY 1
  ), rows AS (
    SELECT 1 AS section, 'Audit log' AS label, action AS item, entity AS detail, n FROM audit
    UNION ALL SELECT 2, 'Consents (current)', purpose, status, n FROM consents
    UNION ALL SELECT 3, 'Consents changed in period', purpose, change, n FROM changes
  )
  SELECT jsonb_build_object(
    'columns', jsonb_build_array('Section', 'Item', 'Detail', 'Count'),
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_array(label, item, detail, n) ORDER BY section, item, detail) FROM rows),
                     '[]'::jsonb),
    'metrics', jsonb_build_array(
      itap.report_metric('audit_entries', 'count', (SELECT coalesce(sum(n), 0) FROM audit), 'entries'),
      itap.report_metric('sensitive_views', 'count', (SELECT coalesce(sum(n), 0) FROM audit WHERE action = 'view_sensitive'), 'entries'),
      itap.report_metric('exports', 'count', (SELECT coalesce(sum(n), 0) FROM audit WHERE action = 'export'), 'entries'),
      itap.report_metric('consents_granted', 'count', (SELECT coalesce(sum(n), 0) FROM consents WHERE status = 'granted'), 'records'),
      itap.report_metric('consents_withdrawn', 'count', (SELECT coalesce(sum(n), 0) FROM consents WHERE status = 'withdrawn'), 'records'),
      itap.report_metric('withdrawals_in_period', 'count', (SELECT coalesce(sum(n), 0) FROM changes WHERE change = 'withdrawn'), 'records')),
    'summary', jsonb_build_array(jsonb_build_object(
      'label', 'Not covered yet', 'value', 'data subject requests, retention runs, legal holds (planned)')));
$$;

CREATE FUNCTION itap.report_device_health(c itap.report_context) RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH d AS (
    SELECT dv.id, dv.code, dv.name, dv.device_type, dv.health_status, f.name AS facility,
           m.samples, m.cpu, m.memory, m.latency, m.fps, coalesce(m.errors, 0) AS errors, coalesce(e.offline, 0) AS offline
    FROM itap.devices dv
    LEFT JOIN itap.facilities f ON f.organization_id = dv.organization_id AND f.id = dv.facility_id
    LEFT JOIN LATERAL (
      SELECT count(*) AS samples, avg(x.cpu_usage) AS cpu, avg(x.memory_usage) AS memory,
             avg(x.network_latency_ms) AS latency, avg(x.frame_rate) AS fps, sum(x.error_count) AS errors
      FROM itap.device_health_metrics x
      WHERE x.organization_id = dv.organization_id AND x.device_id = dv.id
        AND x.recorded_at >= c.from_ts AND x.recorded_at < c.to_ts
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS offline FROM itap.device_events x
      WHERE x.organization_id = dv.organization_id AND x.device_id = dv.id AND x.kind = 'offline'
        AND x.occurred_at >= c.from_ts AND x.occurred_at < c.to_ts
    ) e ON true
    WHERE dv.organization_id = c.organization_id
      AND (NOT c.facilities_explicit OR dv.facility_id = ANY (c.facility_ids))
  )
  SELECT jsonb_build_object(
    'columns', jsonb_build_array('Device', 'Name', 'Type', 'Facility', 'Samples', 'Avg CPU %', 'Avg memory %',
                                 'Avg latency ms', 'Avg frame rate', 'Errors', 'Offline events', 'Health now'),
    'rows', coalesce(jsonb_agg(jsonb_build_array(code, name, device_type, facility, samples, round(cpu::numeric, 1),
                                                 round(memory::numeric, 1), round(latency::numeric, 1), round(fps::numeric, 1),
                                                 errors, offline, health_status) ORDER BY facility, name, code), '[]'::jsonb),
    'metrics', jsonb_build_array(
      itap.report_metric('devices', 'count', count(*), 'devices'),
      itap.report_metric('samples', 'count', coalesce(sum(samples), 0), 'samples'),
      itap.report_metric('errors', 'count', coalesce(sum(errors), 0), 'errors'),
      itap.report_metric('offline_events', 'count', coalesce(sum(offline), 0), 'events'),
      itap.report_metric('devices_with_outages', 'count', count(*) FILTER (WHERE offline > 0), 'devices'),
      itap.report_metric('avg_latency_ms', 'average', (sum(latency * samples) / nullif(sum(samples) FILTER (WHERE latency IS NOT NULL), 0))::numeric, 'ms')),
    'summary', '[]'::jsonb)
  FROM d;
$$;

CREATE FUNCTION itap.report_incident(c itap.report_context) RETURNS jsonb
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
