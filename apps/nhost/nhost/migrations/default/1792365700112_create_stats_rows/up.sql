-- Stats rows of an hour-aligned range [p_from, p_to) (plan-07 task 1): pure reads over itap.stats_presence; the
-- writers (next migration) upsert them. Models are documented on the stats tables (1792365700109).

-- Hourly rows (area and facility-total scopes) for every hour in [p_from, p_to) with activity. Peak occupancy:
-- sweep over the merged intervals present in the hour; at one instant departures are applied before arrivals, an
-- interval of zero length (a single-detection session) counts at its instant.
CREATE FUNCTION itap.stats_hourly_rows(p_org uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (facility_id uuid, area_id uuid, hour timestamptz, unique_identities integer, entries integer,
               exits integer, dwell_seconds integer, avg_dwell_seconds integer, peak_occupancy integer)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH raw AS MATERIALIZED (SELECT * FROM itap.stats_presence(p_org, p_from, p_to, true)),
  merged AS MATERIALIZED (SELECT * FROM itap.stats_merged_presence(p_org, p_from, p_to, true)),
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

-- Facility daily rows for the local days touched by [p_from, p_to) (itap.stats_days windows), days with activity
-- only. Known / unknown: the effective identity is linked to a profile now (at aggregation time).
CREATE FUNCTION itap.stats_daily_rows(p_org uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (facility_id uuid, day date, unique_identities integer, known_identities integer,
               unknown_identities integer, visits integer, guest_visits integer, avg_visit_minutes numeric,
               dwell_seconds integer, peak_occupancy integer, peak_hour smallint)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH days AS MATERIALIZED (SELECT * FROM itap.stats_days(p_org, p_from, p_to)),
  lo AS (SELECT min(d.day_start) AS lo, max(d.window_end) AS hi FROM days d),
  raw AS MATERIALIZED (SELECT r.* FROM lo, itap.stats_presence(p_org, lo.lo, lo.hi, false) r),
  merged AS MATERIALIZED (SELECT m.* FROM lo, itap.stats_merged_presence(p_org, lo.lo, lo.hi, false) m),
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

-- Area transitions per local day touched by [p_from, p_to): a run following a run in another area of the same
-- session, counted on the local day its run starts.
CREATE FUNCTION itap.stats_transition_rows(p_org uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (facility_id uuid, day date, from_area_id uuid, to_area_id uuid, count integer)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH days AS MATERIALIZED (SELECT * FROM itap.stats_days(p_org, p_from, p_to)),
  lo AS (SELECT min(d.day_start) AS lo, max(d.window_end) AS hi FROM days d)
  SELECT d.facility_id, d.day, r.from_area_id, r.area_id, count(*)::integer
  FROM lo
  CROSS JOIN LATERAL itap.stats_presence(p_org, lo.lo, lo.hi, true) r
  JOIN days d ON d.facility_id = r.facility_id AND r.started_at >= d.day_start AND r.started_at < d.window_end
  WHERE r.area_id IS NOT NULL AND r.from_area_id IS NOT NULL
  GROUP BY d.facility_id, d.day, r.from_area_id, r.area_id;
$$;
