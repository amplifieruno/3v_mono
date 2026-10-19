-- identity_timeline, fix round 1: the source row id (session / location / event / visit) is the final ORDER BY
-- tiebreak, so equal timestamps of several rows of one kind always come in the same order (stable LIMIT pages).
CREATE OR REPLACE FUNCTION itap.identity_timeline(hasura_session json, p_identity uuid, p_from timestamptz DEFAULT NULL,
                                       p_to timestamptz DEFAULT NULL, p_limit integer DEFAULT 100)
RETURNS SETOF itap_results.identity_timeline_entries
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH RECURSIVE org AS (SELECT itap.session_organization(hasura_session) AS id),
  members (id, depth) AS (
    SELECT i.id, 0 FROM itap.identities i, org WHERE i.organization_id = org.id AND i.id = p_identity
    UNION
    SELECT s.source_identity_id, m.depth + 1
    FROM members m
    JOIN org ON true
    JOIN itap.identity_merges g ON g.organization_id = org.id AND g.target_identity_id = m.id AND g.status = 'completed'
    JOIN itap.identity_merge_sources s ON s.organization_id = org.id AND s.merge_id = g.id
    WHERE m.depth < 32
  ),
  ids AS (SELECT DISTINCT id FROM members),
  sessions AS (
    SELECT t.* FROM itap.tracking_sessions t, org WHERE t.organization_id = org.id AND t.identity_id IN (SELECT id FROM ids)
  ),
  visits AS (
    SELECT v.*, coalesce(
             (SELECT s.identity_id FROM sessions s WHERE s.visit_id = v.id ORDER BY s.started_at LIMIT 1), p_identity
           ) AS identity_id
    FROM itap.visits v, org
    WHERE v.organization_id = org.id AND (
      v.id IN (SELECT s.visit_id FROM sessions s)
      OR v.visitor_profile_id = (SELECT i.profile_id FROM itap.identities i WHERE i.organization_id = org.id AND i.id = p_identity)
    )
  ),
  entries AS (
    SELECT s.identity_id, 'session_started' AS kind, 1 AS rank, s.started_at AS occurred_at, s.facility_id,
           NULL::uuid AS area_id, NULL::uuid AS access_point_id, NULL::uuid AS device_id, s.id AS session_id,
           s.opened_by_detection_id AS detection_id, NULL::uuid AS event_id, NULL::text AS event_type,
           NULL::text AS severity, NULL::text AS title, s.visit_id, NULL::text AS movement_type, NULL::text AS status,
           s.id AS row_id
    FROM sessions s
    UNION ALL
    SELECT s.identity_id, 'session_ended', 5, s.ended_at, s.facility_id, s.last_area_id, s.last_access_point_id, NULL,
           s.id, NULL, NULL, NULL, NULL, NULL, s.visit_id, NULL, s.status, s.id
    FROM sessions s WHERE s.ended_at IS NOT NULL
    UNION ALL
    SELECT l.identity_id, 'location', 2, l.occurred_at, l.facility_id, l.area_id, l.access_point_id, l.device_id,
           l.session_id, l.detection_id, NULL, NULL, NULL, NULL, NULL, l.movement_type, NULL, l.id
    FROM itap.identity_locations l, org
    WHERE l.organization_id = org.id AND l.identity_id IN (SELECT id FROM ids)
    UNION ALL
    SELECT e.identity_id, 'event', 3, e.occurred_at, e.facility_id, e.area_id, e.access_point_id, e.device_id,
           e.session_id, e.detection_id, e.id, e.event_type, e.severity, e.title, NULL, NULL, NULL, e.id
    FROM itap.events e, org
    WHERE e.organization_id = org.id AND e.identity_id IN (SELECT id FROM ids)
    UNION ALL
    SELECT v.identity_id, 'visit_checked_in', 4, v.checked_in_at, v.facility_id, NULL, NULL, NULL, NULL, NULL, NULL,
           NULL, NULL, v.code, v.id, NULL, v.status, v.id
    FROM visits v WHERE v.checked_in_at IS NOT NULL
    UNION ALL
    SELECT v.identity_id, 'visit_checked_out', 4, v.checked_out_at, v.facility_id, NULL, NULL, NULL, NULL, NULL, NULL,
           NULL, NULL, v.code, v.id, NULL, v.status, v.id
    FROM visits v WHERE v.checked_out_at IS NOT NULL
  )
  SELECT org.id, x.identity_id, x.kind, x.occurred_at, x.facility_id, x.area_id, x.access_point_id, x.device_id,
         x.session_id, x.detection_id, x.event_id, x.event_type, x.severity, x.title, x.visit_id, x.movement_type, x.status
  FROM entries x, org
  WHERE (p_from IS NULL OR x.occurred_at >= p_from) AND (p_to IS NULL OR x.occurred_at < p_to)
  ORDER BY x.occurred_at DESC, x.rank DESC, x.kind, x.event_type, x.identity_id, x.row_id
  LIMIT least(greatest(coalesce(p_limit, 100), 1), 500);
$$;
