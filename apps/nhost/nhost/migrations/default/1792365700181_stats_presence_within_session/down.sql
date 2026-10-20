-- Restore stats_presence as of migration 117 (locations may lie after the session end).
CREATE OR REPLACE FUNCTION itap.stats_presence(p_org uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_areas boolean)
 RETURNS TABLE(facility_id uuid, area_id uuid, identity_id uuid, session_id uuid, started_at timestamp with time zone, ended_at timestamp with time zone, is_exit boolean, from_area_id uuid, merge_group bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
  WITH RECURSIVE scoped AS MATERIALIZED (
    SELECT s.id, s.facility_id, s.identity_id, s.started_at, coalesce(s.ended_at, s.last_detected_at) AS ended_at,
           s.ended_at IS NOT NULL AS closed
    FROM itap.tracking_sessions s
    WHERE s.organization_id = p_org AND s.facility_id IS NOT NULL AND s.identity_id IS NOT NULL
      AND s.started_at < p_to AND (s.status = 'active' OR s.ended_at >= p_from)
      AND coalesce(s.ended_at, s.last_detected_at) >= p_from
  ),
  hops AS (
    SELECT ms.source_identity_id AS id, m.target_identity_id AS target
    FROM itap.identity_merge_sources ms
    JOIN itap.identity_merges m ON m.organization_id = ms.organization_id AND m.id = ms.merge_id
    WHERE ms.organization_id = p_org AND m.status = 'completed'
  ),
  chain (identity_id, current_id, depth) AS (
    SELECT DISTINCT x.identity_id, x.identity_id, 0 FROM scoped x
    UNION ALL
    SELECT c.identity_id, h.target, c.depth + 1 FROM chain c JOIN hops h ON h.id = c.current_id WHERE c.depth < 32
  ),
  effective AS (
    SELECT DISTINCT ON (c.identity_id) c.identity_id, c.current_id AS effective_id
    FROM chain c ORDER BY c.identity_id, c.depth DESC
  ),
  sessions AS (
    SELECT x.id, x.facility_id, e.effective_id AS identity_id, x.started_at, x.ended_at, x.closed
    FROM scoped x JOIN effective e ON e.identity_id = x.identity_id
  ),
  located AS (
    SELECT l.session_id, l.area_id, l.occurred_at, l.id,
           lag(l.area_id) OVER (PARTITION BY l.session_id ORDER BY l.occurred_at, l.id) AS prev_area
    FROM itap.identity_locations l
    JOIN sessions s ON s.id = l.session_id
    WHERE p_areas AND l.organization_id = p_org AND l.area_id IS NOT NULL
  ),
  runs AS (
    SELECT r.session_id, r.area_id, r.prev_area, r.occurred_at,
           lead(r.occurred_at) OVER (PARTITION BY r.session_id ORDER BY r.occurred_at, r.id) AS next_start
    FROM located r
    WHERE r.prev_area IS DISTINCT FROM r.area_id
  ),
  intervals AS (
    SELECT s.facility_id, NULL::uuid AS area_id, s.identity_id, s.id AS session_id, s.started_at, s.ended_at,
           s.closed AS is_exit, NULL::uuid AS from_area_id
    FROM sessions s
    UNION ALL
    SELECT s.facility_id, r.area_id, s.identity_id, s.id, r.occurred_at,
           greatest(coalesce(r.next_start, s.ended_at), r.occurred_at), r.next_start IS NOT NULL OR s.closed, r.prev_area
    FROM runs r JOIN sessions s ON s.id = r.session_id
  ),
  breaks AS (
    SELECT i.*, coalesce(i.started_at > max(i.ended_at) OVER (
             PARTITION BY i.facility_id, i.area_id, i.identity_id ORDER BY i.started_at, i.ended_at, i.session_id
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), true) AS brk
    FROM intervals i
  )
  SELECT b.facility_id, b.area_id, b.identity_id, b.session_id, b.started_at, b.ended_at, b.is_exit, b.from_area_id,
         count(*) FILTER (WHERE b.brk) OVER (
           PARTITION BY b.facility_id, b.area_id, b.identity_id ORDER BY b.started_at, b.ended_at, b.session_id
           ROWS UNBOUNDED PRECEDING)
  FROM breaks b;
$function$

;
