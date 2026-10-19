-- Building blocks of the stats aggregation (plan-07 task 1; spec §8.3 aggregate_stats). All STABLE and internal
-- (untracked); the writers are itap.aggregate_stats / itap.aggregate_stats_range (next migration).

-- Start of the UTC hour containing p_at (independent of the session TimeZone, unlike date_trunc on timestamptz).
CREATE FUNCTION itap.hour_floor(p_at timestamptz) RETURNS timestamptz
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT to_timestamp(floor(extract(epoch FROM p_at) / 3600) * 3600);
$$;

-- Every identity of the organization with its effective identity: completed merges followed source -> target
-- (chains included), as in itap.activity_stats_rows. An unmerged identity maps to itself.
CREATE FUNCTION itap.effective_identities(p_org uuid) RETURNS TABLE (identity_id uuid, effective_id uuid)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH RECURSIVE hops AS (
    SELECT s.source_identity_id AS id, m.target_identity_id AS target
    FROM itap.identity_merge_sources s
    JOIN itap.identity_merges m ON m.organization_id = s.organization_id AND m.id = s.merge_id
    WHERE s.organization_id = p_org AND m.status = 'completed'
  ),
  chain (identity_id, current_id, depth) AS (
    SELECT i.id, i.id, 0 FROM itap.identities i WHERE i.organization_id = p_org
    UNION ALL
    SELECT c.identity_id, h.target, c.depth + 1 FROM chain c JOIN hops h ON h.id = c.current_id WHERE c.depth < 32
  )
  SELECT DISTINCT ON (identity_id) identity_id, current_id FROM chain ORDER BY identity_id, depth DESC;
$$;

-- Presence intervals [started_at, ended_at] (closed) of sessions overlapping [p_from, p_to], per effective identity:
-- * facility scope (area_id NULL): the tracking session, ended_at = ended_at or, while active, last_detected_at;
--   is_exit = the session is closed;
-- * area scope (p_areas): runs of consecutive identity_locations of the session with the same area (locations
--   without area and access-point changes inside one area continue the run, ordered by occurred_at, id); a run ends
--   where the next run starts, the last one at the session end; is_exit = not the last run, or the session is
--   closed; from_area_id = the previous run's area (a transition), NULL for the first run.
CREATE FUNCTION itap.stats_presence(p_org uuid, p_from timestamptz, p_to timestamptz, p_areas boolean)
RETURNS TABLE (facility_id uuid, area_id uuid, identity_id uuid, session_id uuid, started_at timestamptz,
               ended_at timestamptz, is_exit boolean, from_area_id uuid)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH sessions AS MATERIALIZED (
    SELECT s.id, s.facility_id, e.effective_id AS identity_id, s.started_at,
           coalesce(s.ended_at, s.last_detected_at) AS ended_at, s.ended_at IS NOT NULL AS closed
    FROM itap.tracking_sessions s
    JOIN itap.effective_identities(p_org) e ON e.identity_id = s.identity_id
    WHERE s.organization_id = p_org AND s.facility_id IS NOT NULL
      AND s.started_at < p_to AND coalesce(s.ended_at, s.last_detected_at) >= p_from
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
  )
  SELECT s.facility_id, NULL::uuid, s.identity_id, s.id, s.started_at, s.ended_at, s.closed, NULL::uuid
  FROM sessions s
  UNION ALL
  SELECT s.facility_id, r.area_id, s.identity_id, s.id, r.occurred_at, greatest(coalesce(r.next_start, s.ended_at), r.occurred_at),
         r.next_start IS NOT NULL OR s.closed, r.prev_area
  FROM runs r JOIN sessions s ON s.id = r.session_id;
$$;

-- stats_presence with the intervals of one effective identity in one scope merged where they overlap or touch
-- (identities merged into one count once in dwell, unique and peak).
CREATE FUNCTION itap.stats_merged_presence(p_org uuid, p_from timestamptz, p_to timestamptz, p_areas boolean)
RETURNS TABLE (facility_id uuid, area_id uuid, identity_id uuid, started_at timestamptz, ended_at timestamptz)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH breaks AS (
    SELECT p.facility_id, p.area_id, p.identity_id, p.started_at, p.ended_at,
           coalesce(p.started_at > max(p.ended_at) OVER (
             PARTITION BY p.facility_id, p.area_id, p.identity_id ORDER BY p.started_at, p.ended_at
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), true) AS brk
    FROM itap.stats_presence(p_org, p_from, p_to, p_areas) p
  ),
  groups AS (
    SELECT b.*, count(*) FILTER (WHERE b.brk) OVER (
             PARTITION BY b.facility_id, b.area_id, b.identity_id ORDER BY b.started_at, b.ended_at
             ROWS UNBOUNDED PRECEDING) AS grp
    FROM breaks b
  )
  SELECT g.facility_id, g.area_id, g.identity_id, min(g.started_at), max(g.ended_at)
  FROM groups g
  GROUP BY g.facility_id, g.area_id, g.identity_id, g.grp;
$$;

-- Facility-local days touched by the hours [p_from, p_to) per facility of the organization: [day_start, window_end)
-- = local midnight to the next local midnight. A day is always aggregated over the whole day with the data present
-- (a day in progress: everything ingested so far), so re-aggregating an earlier hour of the day (a late cron retry)
-- never regresses its row, and any order of hourly runs ends with the same rows.
CREATE FUNCTION itap.stats_days(p_org uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (facility_id uuid, timezone text, day date, day_start timestamptz, window_end timestamptz)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT f.id, f.timezone, d::date, d AT TIME ZONE f.timezone, (d + interval '1 day') AT TIME ZONE f.timezone
  FROM itap.facilities f
  CROSS JOIN LATERAL generate_series((p_from AT TIME ZONE f.timezone)::date::timestamp,
                                     ((p_to - interval '1 microsecond') AT TIME ZONE f.timezone)::date::timestamp,
                                     interval '1 day') d
  WHERE f.organization_id = p_org AND p_from < p_to;
$$;
