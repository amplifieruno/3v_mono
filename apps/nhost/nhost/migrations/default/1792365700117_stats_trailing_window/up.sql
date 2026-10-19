-- Stats aggregation, fix round 1 (slice 7 task 1):
-- * aggregate_stats(org, at) re-aggregates a trailing window [hour(at - tracking timeout - 180 s) - 1 h, hour(at)):
--   close_stale_sessions closes a session up to timeout + 60 s after its last detection and back-dates ended_at to
--   it, so an exit (and the dwell end) can land in an hour that was already aggregated; the next runs pick it up
--   (idempotent upserts; a missed run is healed by the next one). The days touched are recomputed whole as before.
-- * stats_presence scans only sessions that can overlap the period (active, or ended at / after p_from; index on
--   ended_at), resolves effective identities only for those sessions' identities, and returns merge_group (intervals
--   of one effective identity in one scope that overlap or touch share it), so each stats function reads presence
--   once; stats_merged_presence is gone. Intervals are ordered by (started_at, ended_at, session_id) (total order).
CREATE INDEX tracking_sessions_organization_id_ended_at_idx ON itap.tracking_sessions (organization_id, ended_at);

DROP FUNCTION itap.stats_merged_presence(uuid, timestamptz, timestamptz, boolean);
DROP FUNCTION itap.stats_presence(uuid, timestamptz, timestamptz, boolean);

CREATE FUNCTION itap.stats_presence(p_org uuid, p_from timestamptz, p_to timestamptz, p_areas boolean)
RETURNS TABLE (facility_id uuid, area_id uuid, identity_id uuid, session_id uuid, started_at timestamptz,
               ended_at timestamptz, is_exit boolean, from_area_id uuid, merge_group bigint)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
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
$$;

CREATE OR REPLACE FUNCTION itap.stats_hourly_rows(p_org uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (facility_id uuid, area_id uuid, hour timestamptz, unique_identities integer, entries integer,
               exits integer, dwell_seconds integer, avg_dwell_seconds integer, peak_occupancy integer)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH raw AS MATERIALIZED (SELECT * FROM itap.stats_presence(p_org, p_from, p_to, true)),
  merged AS MATERIALIZED (
    SELECT r.facility_id, r.area_id, r.identity_id, min(r.started_at) AS started_at, max(r.ended_at) AS ended_at
    FROM raw r GROUP BY r.facility_id, r.area_id, r.identity_id, r.merge_group
  ),
  moves AS (
    SELECT r.facility_id, r.area_id, itap.hour_floor(r.started_at) AS hour, 1 AS entries, 0 AS exits
    FROM raw r WHERE r.started_at >= p_from AND r.started_at < p_to
    UNION ALL
    SELECT r.facility_id, r.area_id, itap.hour_floor(r.ended_at), 0, 1
    FROM raw r WHERE r.is_exit AND r.ended_at >= p_from AND r.ended_at < p_to
  ),
  move_totals AS (
    SELECT m.facility_id, m.area_id, m.hour, sum(m.entries)::integer AS entries, sum(m.exits)::integer AS exits
    FROM moves m GROUP BY m.facility_id, m.area_id, m.hour
  ),
  present AS MATERIALIZED (
    -- An interval is present in an hour when it starts inside it or covers part of it.
    SELECT m.facility_id, m.area_id, m.identity_id, m.started_at AS s, m.ended_at AS e, h AS hour,
           h + interval '1 hour' AS hour_end
    FROM merged m
    CROSS JOIN LATERAL generate_series(itap.hour_floor(greatest(m.started_at, p_from)),
                                       itap.hour_floor(least(m.ended_at, p_to - interval '1 microsecond')),
                                       interval '1 hour') h
    WHERE (m.started_at >= h AND m.started_at < h + interval '1 hour') OR (m.started_at < h AND m.ended_at > h)
  ),
  presence_totals AS (
    SELECT p.facility_id, p.area_id, p.hour, count(DISTINCT p.identity_id)::integer AS unique_identities,
           round(sum(extract(epoch FROM least(p.e, p.hour_end) - greatest(p.s, p.hour))))::integer AS dwell_seconds
    FROM present p GROUP BY p.facility_id, p.area_id, p.hour
  ),
  sweep AS (
    SELECT ev.facility_id, ev.area_id, ev.hour,
           sum(ev.delta) OVER (PARTITION BY ev.facility_id, ev.area_id, ev.hour ORDER BY ev.t, ev.ord
                               ROWS UNBOUNDED PRECEDING) AS n
    FROM (
      SELECT p.facility_id, p.area_id, p.hour, greatest(p.s, p.hour) AS t, 1 AS delta, 1 AS ord FROM present p
      UNION ALL
      SELECT p.facility_id, p.area_id, p.hour, p.e, -1, CASE WHEN p.e = p.s THEN 2 ELSE 0 END
      FROM present p WHERE p.e < p.hour_end
    ) ev
  ),
  peaks AS (
    SELECT s.facility_id, s.area_id, s.hour, max(s.n)::integer AS peak FROM sweep s
    GROUP BY s.facility_id, s.area_id, s.hour
  ),
  keys AS (
    SELECT t.facility_id, t.area_id, t.hour FROM presence_totals t
    UNION
    SELECT t.facility_id, t.area_id, t.hour FROM move_totals t
  )
  SELECT k.facility_id, k.area_id, k.hour, coalesce(pt.unique_identities, 0), coalesce(mt.entries, 0),
         coalesce(mt.exits, 0), coalesce(pt.dwell_seconds, 0),
         CASE WHEN pt.unique_identities > 0 THEN round(pt.dwell_seconds::numeric / pt.unique_identities)::integer END,
         coalesce(pk.peak, 0)
  FROM keys k
  LEFT JOIN presence_totals pt ON pt.facility_id = k.facility_id AND pt.area_id IS NOT DISTINCT FROM k.area_id AND pt.hour = k.hour
  LEFT JOIN move_totals mt ON mt.facility_id = k.facility_id AND mt.area_id IS NOT DISTINCT FROM k.area_id AND mt.hour = k.hour
  LEFT JOIN peaks pk ON pk.facility_id = k.facility_id AND pk.area_id IS NOT DISTINCT FROM k.area_id AND pk.hour = k.hour;
$$;

CREATE OR REPLACE FUNCTION itap.stats_daily_rows(p_org uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (facility_id uuid, day date, unique_identities integer, known_identities integer,
               unknown_identities integer, visits integer, guest_visits integer, avg_visit_minutes numeric,
               dwell_seconds integer, peak_occupancy integer, peak_hour smallint)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH days AS MATERIALIZED (SELECT * FROM itap.stats_days(p_org, p_from, p_to)),
  lo AS (SELECT min(d.day_start) AS lo, max(d.window_end) AS hi FROM days d),
  raw AS MATERIALIZED (SELECT r.* FROM lo, itap.stats_presence(p_org, lo.lo, lo.hi, false) r),
  merged AS MATERIALIZED (
    SELECT r.facility_id, r.area_id, r.identity_id, min(r.started_at) AS started_at, max(r.ended_at) AS ended_at
    FROM raw r GROUP BY r.facility_id, r.area_id, r.identity_id, r.merge_group
  ),
  present AS MATERIALIZED (
    SELECT d.facility_id, d.day, d.timezone, d.day_start, d.window_end, m.identity_id, m.started_at AS s, m.ended_at AS e
    FROM merged m
    JOIN days d ON d.facility_id = m.facility_id
     AND ((m.started_at >= d.day_start AND m.started_at < d.window_end) OR (m.started_at < d.day_start AND m.ended_at > d.day_start))
  ),
  people AS (
    SELECT p.facility_id, p.day, count(DISTINCT p.identity_id)::integer AS unique_identities,
           (count(DISTINCT p.identity_id) FILTER (WHERE i.profile_id IS NOT NULL))::integer AS known_identities,
           round(sum(extract(epoch FROM least(p.e, p.window_end) - greatest(p.s, p.day_start))))::integer AS dwell_seconds
    FROM present p
    LEFT JOIN itap.identities i ON i.organization_id = p_org AND i.id = p.identity_id
    GROUP BY p.facility_id, p.day
  ),
  sweep AS (
    SELECT ev.facility_id, ev.day, ev.timezone, ev.t, ev.ord,
           sum(ev.delta) OVER (PARTITION BY ev.facility_id, ev.day ORDER BY ev.t, ev.ord ROWS UNBOUNDED PRECEDING) AS n
    FROM (
      SELECT p.facility_id, p.day, p.timezone, greatest(p.s, p.day_start) AS t, 1 AS delta, 1 AS ord FROM present p
      UNION ALL
      SELECT p.facility_id, p.day, p.timezone, p.e, -1, CASE WHEN p.e = p.s THEN 2 ELSE 0 END
      FROM present p WHERE p.e < p.window_end
    ) ev
  ),
  peaks AS (
    SELECT DISTINCT ON (s.facility_id, s.day) s.facility_id, s.day, s.n::integer AS peak,
           extract(hour FROM s.t AT TIME ZONE s.timezone)::smallint AS peak_hour
    FROM sweep s ORDER BY s.facility_id, s.day, s.n DESC, s.t, s.ord
  ),
  sessions AS (
    SELECT d.facility_id, d.day, count(*)::integer AS visits,
           round(avg(extract(epoch FROM r.ended_at - r.started_at)) / 60, 2) AS avg_visit_minutes
    FROM raw r
    JOIN days d ON d.facility_id = r.facility_id AND r.started_at >= d.day_start AND r.started_at < d.window_end
    GROUP BY d.facility_id, d.day
  ),
  guests AS (
    SELECT d.facility_id, d.day, count(*)::integer AS guest_visits
    FROM itap.visits v
    JOIN days d ON d.facility_id = v.facility_id AND v.checked_in_at >= d.day_start AND v.checked_in_at < d.window_end
    WHERE v.organization_id = p_org
    GROUP BY d.facility_id, d.day
  ),
  keys AS (
    SELECT x.facility_id, x.day FROM people x UNION SELECT x.facility_id, x.day FROM sessions x
    UNION SELECT x.facility_id, x.day FROM guests x
  )
  SELECT k.facility_id, k.day, coalesce(pp.unique_identities, 0), coalesce(pp.known_identities, 0),
         coalesce(pp.unique_identities, 0) - coalesce(pp.known_identities, 0), coalesce(ss.visits, 0),
         coalesce(g.guest_visits, 0), ss.avg_visit_minutes, coalesce(pp.dwell_seconds, 0), coalesce(pk.peak, 0),
         pk.peak_hour
  FROM keys k
  LEFT JOIN people pp ON pp.facility_id = k.facility_id AND pp.day = k.day
  LEFT JOIN sessions ss ON ss.facility_id = k.facility_id AND ss.day = k.day
  LEFT JOIN guests g ON g.facility_id = k.facility_id AND g.day = k.day
  LEFT JOIN peaks pk ON pk.facility_id = k.facility_id AND pk.day = k.day;
$$;

CREATE OR REPLACE FUNCTION itap.aggregate_stats(p_organization uuid, p_at timestamptz)
RETURNS SETOF itap_results.stats_aggregations
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  timeout_seconds integer;
BEGIN
  IF p_at IS NULL THEN
    PERFORM itap.raise_code('stats_period_invalid');
  END IF;
  SELECT st.tracking_timeout_seconds INTO timeout_seconds
  FROM itap.organization_settings st WHERE st.organization_id = p_organization;
  timeout_seconds := coalesce(timeout_seconds, 300);
  RETURN QUERY
  SELECT * FROM itap.aggregate_stats_range(
    p_organization,
    itap.hour_floor(p_at - make_interval(secs => timeout_seconds + 180)) - interval '1 hour',
    itap.hour_floor(p_at));
END;
$$;
