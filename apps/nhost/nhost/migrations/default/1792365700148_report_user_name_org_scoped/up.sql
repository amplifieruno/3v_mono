-- Slice 7 final review: report_user_name / report_details_text resolve a user id to a name or email only when the user
-- is (or was) a member of the report's organization; ids of other tenants' users stay anonymous.
CREATE FUNCTION itap.report_user_name(p_organization uuid, p_user uuid) RETURNS text
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(nullif(btrim(u.display_name), ''), u.email)
  FROM auth.users u
  WHERE u.id = p_user
    AND EXISTS (SELECT 1 FROM itap.organization_members m WHERE m.organization_id = p_organization AND m.user_id = u.id);
$$;

-- "key: value, ..." of activity details (keys sorted, nulls skipped); a uuid value is shown as the name of a member of
-- the organization, otherwise left out (internal ids, other tenants' users).
CREATE FUNCTION itap.report_details_text(p_organization uuid, p_details jsonb) RETURNS text
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT coalesce(string_agg(d.key || ': ' || d.v, ', ' ORDER BY d.key), '')
  FROM (
    SELECT e.key,
           CASE
             WHEN jsonb_typeof(e.value) = 'string'
                  AND (e.value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               THEN itap.report_user_name(p_organization, (e.value #>> '{}')::uuid)
             WHEN jsonb_typeof(e.value) = 'string' THEN e.value #>> '{}'
             ELSE e.value::text
           END AS v
    FROM jsonb_each(coalesce(p_details, '{}'::jsonb)) e
    WHERE jsonb_typeof(e.value) <> 'null'
  ) d
  WHERE d.v IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION itap.report_incident(c itap.report_context)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
  WITH i AS (
    SELECT i.*, f.name AS facility, a.name AS area, itap.report_user_name(c.organization_id, i.assigned_to) AS assignee
    FROM itap.incidents i
    LEFT JOIN itap.facilities f ON f.organization_id = i.organization_id AND f.id = i.facility_id
    LEFT JOIN itap.areas a ON a.organization_id = i.organization_id AND a.id = i.area_id
    WHERE i.organization_id = c.organization_id AND i.id = c.incident_id
  ), timeline AS (
    SELECT x.occurred_at AS at, x.kind, itap.report_user_name(c.organization_id, x.actor_id) AS actor,
           itap.report_details_text(c.organization_id, x.details) AS details
    FROM itap.incident_activities x
    WHERE x.organization_id = c.organization_id AND x.incident_id = c.incident_id AND x.kind <> 'note'
    UNION ALL
    SELECT n.created_at, 'note', itap.report_user_name(c.organization_id, n.author_id), n.body
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
$function$;

DROP FUNCTION itap.report_details_text(jsonb);
DROP FUNCTION itap.report_user_name(uuid);
