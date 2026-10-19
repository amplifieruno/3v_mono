-- Analytics query functions (spec §8.1, plan-07 task 1): tracked for org_admin, STABLE, scoped to the session
-- organization (a facility of another organization yields no rows), results in itap_results. They read the stats
-- tables and current state, never raw detections over long ranges.

-- Current occupancy per area of a facility (area_occupancy, one leaf area per tracked person): occupancy = people
-- in the area's subtree, direct_occupancy = people located in the area itself; plus one facility total row
-- (area_id NULL). Every area of the facility is listed (zeros included).
CREATE TABLE itap_results.facility_occupancy_rows (
  organization_id uuid NOT NULL,
  facility_id uuid NOT NULL,
  area_id uuid,
  parent_id uuid,
  name text NOT NULL,
  capacity integer,
  occupancy integer NOT NULL,
  direct_occupancy integer NOT NULL
);

CREATE FUNCTION itap.facility_occupancy_now(hasura_session json, p_facility uuid)
RETURNS SETOF itap_results.facility_occupancy_rows
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH f AS (
    SELECT f.* FROM itap.facilities f
    WHERE f.organization_id = itap.session_organization(hasura_session) AND f.id = p_facility
  ),
  occ AS (
    SELECT o.area_id, a.path FROM itap.area_occupancy o
    JOIN f ON f.organization_id = o.organization_id AND f.id = o.facility_id
    JOIN itap.areas a ON a.organization_id = o.organization_id AND a.id = o.area_id
  )
  SELECT f.organization_id, f.id, NULL::uuid, NULL::uuid, f.name, NULL::integer,
         (SELECT count(*) FROM occ)::integer, (SELECT count(*) FROM occ)::integer
  FROM f
  UNION ALL
  SELECT a.organization_id, a.facility_id, a.id, a.parent_id, a.name, a.capacity,
         (SELECT count(*) FROM occ WHERE occ.path @> ARRAY[a.id])::integer,
         (SELECT count(*) FROM occ WHERE occ.area_id = a.id)::integer
  FROM f JOIN itap.areas a ON a.organization_id = f.organization_id AND a.facility_id = f.id;
$$;

-- Facility occupancy over time from the stats: p_bucket 'hour' (UTC hours overlapping [p_from, p_to), facility-total
-- rows of area_hourly_stats) or 'day' (facility-local days overlapping the period: unique / dwell / peak from
-- facility_daily_stats, entries / exits summed over the day's hourly rows). Empty buckets are zero-filled;
-- avg_dwell_seconds = dwell / unique (NULL without people). At most 2000 hour or 731 day buckets.
CREATE TABLE itap_results.occupancy_series_rows (
  organization_id uuid NOT NULL,
  facility_id uuid NOT NULL,
  bucket_start timestamptz NOT NULL,
  day date,
  unique_identities integer NOT NULL,
  entries integer NOT NULL,
  exits integer NOT NULL,
  dwell_seconds integer NOT NULL,
  avg_dwell_seconds integer,
  peak_occupancy integer NOT NULL
);

CREATE FUNCTION itap.occupancy_series(hasura_session json, p_facility uuid, p_from timestamptz, p_to timestamptz,
                                      p_bucket text DEFAULT 'hour')
RETURNS SETOF itap_results.occupancy_series_rows
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org constant uuid := itap.session_organization(hasura_session);
  tz text;
BEGIN
  IF p_bucket IS NULL OR p_bucket NOT IN ('hour', 'day') THEN
    PERFORM itap.raise_code('analytics_bucket_invalid');
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to THEN
    PERFORM itap.raise_code('analytics_period_invalid');
  END IF;
  IF (p_bucket = 'hour' AND p_to - p_from > interval '2000 hours')
     OR (p_bucket = 'day' AND p_to - p_from > interval '731 days') THEN
    PERFORM itap.raise_code('analytics_period_too_long');
  END IF;
  SELECT f.timezone INTO tz FROM itap.facilities f WHERE f.organization_id = org AND f.id = p_facility;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF p_bucket = 'hour' THEN
    RETURN QUERY
    SELECT org, p_facility, h, NULL::date, coalesce(s.unique_identities, 0), coalesce(s.entries, 0),
           coalesce(s.exits, 0), coalesce(s.dwell_seconds, 0), s.avg_dwell_seconds, coalesce(s.peak_occupancy, 0)
    FROM generate_series(itap.hour_floor(p_from), itap.hour_floor(p_to - interval '1 microsecond'), interval '1 hour') h
    LEFT JOIN itap.area_hourly_stats s
      ON s.organization_id = org AND s.facility_id = p_facility AND s.area_id IS NULL AND s.hour = h
    ORDER BY h;
  ELSE
    RETURN QUERY
    WITH days AS (
      SELECT d::date AS day, d AT TIME ZONE tz AS day_start, (d + interval '1 day') AT TIME ZONE tz AS day_end
      FROM generate_series((p_from AT TIME ZONE tz)::date::timestamp,
                           ((p_to - interval '1 microsecond') AT TIME ZONE tz)::date::timestamp, interval '1 day') d
    )
    SELECT org, p_facility, d.day_start, d.day, coalesce(s.unique_identities, 0),
           coalesce(m.entries, 0)::integer, coalesce(m.exits, 0)::integer, coalesce(s.dwell_seconds, 0),
           CASE WHEN s.unique_identities > 0 THEN round(s.dwell_seconds::numeric / s.unique_identities)::integer END,
           coalesce(s.peak_occupancy, 0)
    FROM days d
    LEFT JOIN itap.facility_daily_stats s ON s.organization_id = org AND s.facility_id = p_facility AND s.day = d.day
    LEFT JOIN LATERAL (
      SELECT sum(h.entries) AS entries, sum(h.exits) AS exits FROM itap.area_hourly_stats h
      WHERE h.organization_id = org AND h.facility_id = p_facility AND h.area_id IS NULL
        AND h.hour >= d.day_start AND h.hour < d.day_end
    ) m ON true
    ORDER BY d.day;
  END IF;
END;
$$;

-- Area-to-area movement counts of a facility summed over the facility-local days overlapping [p_from, p_to)
-- (area_transitions_daily), most frequent first. At most 731 days.
CREATE TABLE itap_results.flow_matrix_rows (
  organization_id uuid NOT NULL,
  facility_id uuid NOT NULL,
  from_area_id uuid NOT NULL,
  to_area_id uuid NOT NULL,
  count integer NOT NULL
);

CREATE FUNCTION itap.flow_matrix(hasura_session json, p_facility uuid, p_from timestamptz, p_to timestamptz)
RETURNS SETOF itap_results.flow_matrix_rows
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org constant uuid := itap.session_organization(hasura_session);
  tz text;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to THEN
    PERFORM itap.raise_code('analytics_period_invalid');
  END IF;
  IF p_to - p_from > interval '731 days' THEN
    PERFORM itap.raise_code('analytics_period_too_long');
  END IF;
  SELECT f.timezone INTO tz FROM itap.facilities f WHERE f.organization_id = org AND f.id = p_facility;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT org, p_facility, t.from_area_id, t.to_area_id, sum(t.count)::integer
  FROM itap.area_transitions_daily t
  WHERE t.organization_id = org AND t.facility_id = p_facility
    AND t.day >= (p_from AT TIME ZONE tz)::date AND t.day <= ((p_to - interval '1 microsecond') AT TIME ZONE tz)::date
  GROUP BY t.from_area_id, t.to_area_id
  ORDER BY sum(t.count) DESC, t.from_area_id, t.to_area_id;
END;
$$;

-- Dashboard KPIs of the session organization at now() (one row):
--   unique_visitors_today   effective identities with a tracking session overlapping today (organization-local day)
--   current_occupancy       effective identities currently located (area_occupancy, all facilities)
--   open_incidents[_<severity>]  incidents not resolved / closed
--   devices_offline         non-inactive devices with health critical or status connection_error
--   deliveries_failed_24h   notification deliveries (failed / dead_letter) and webhook deliveries (failed /
--                           dead_letter) created in the last 24 h; subscription deliveries only the caller's own
--   segment_top_movers      up to 5 segments with the largest absolute member_count change between yesterday's
--                           and today's segment_daily_stats (today's row required, a missing yesterday row = 0):
--                           [{segment_id, code, name, member_count, previous_count, change}]
CREATE TABLE itap_results.dashboard_kpi_rows (
  organization_id uuid NOT NULL,
  as_of timestamptz NOT NULL,
  local_date date NOT NULL,
  unique_visitors_today integer NOT NULL,
  current_occupancy integer NOT NULL,
  open_incidents integer NOT NULL,
  open_incidents_critical integer NOT NULL,
  open_incidents_high integer NOT NULL,
  open_incidents_medium integer NOT NULL,
  open_incidents_low integer NOT NULL,
  open_incidents_info integer NOT NULL,
  devices_offline integer NOT NULL,
  deliveries_failed_24h integer NOT NULL,
  segment_top_movers jsonb NOT NULL
);

CREATE FUNCTION itap.dashboard_kpis(hasura_session json)
RETURNS SETOF itap_results.dashboard_kpi_rows
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org constant uuid := itap.session_organization(hasura_session);
  me constant uuid := itap.session_user_id(hasura_session);
  tz text;
  today date;
  day_start timestamptz;
BEGIN
  SELECT o.timezone INTO tz FROM itap.organizations o WHERE o.id = org;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  today := (now() AT TIME ZONE tz)::date;
  day_start := today::timestamp AT TIME ZONE tz;
  RETURN QUERY
  WITH eff AS MATERIALIZED (SELECT * FROM itap.effective_identities(org)),
  incidents AS (
    SELECT i.severity FROM itap.incidents i
    WHERE i.organization_id = org AND i.status NOT IN ('resolved', 'closed')
  ),
  movers AS (
    SELECT s.id, s.code, s.name, t.member_count, coalesce(y.member_count, 0) AS previous_count,
           t.member_count - coalesce(y.member_count, 0) AS change
    FROM itap.segments s
    JOIN itap.segment_daily_stats t ON t.organization_id = org AND t.segment_id = s.id AND t.day = today
    LEFT JOIN itap.segment_daily_stats y ON y.organization_id = org AND y.segment_id = s.id AND y.day = today - 1
    WHERE s.organization_id = org AND t.member_count <> coalesce(y.member_count, 0)
    ORDER BY abs(t.member_count - coalesce(y.member_count, 0)) DESC, s.name
    LIMIT 5
  )
  SELECT org, now(), today,
    (SELECT count(DISTINCT e.effective_id) FROM itap.tracking_sessions s JOIN eff e ON e.identity_id = s.identity_id
     WHERE s.organization_id = org AND s.started_at <= now()
       AND coalesce(s.ended_at, s.last_detected_at) >= day_start)::integer,
    (SELECT count(DISTINCT e.effective_id) FROM itap.area_occupancy o JOIN eff e ON e.identity_id = o.identity_id
     WHERE o.organization_id = org)::integer,
    (SELECT count(*) FROM incidents)::integer,
    (SELECT count(*) FROM incidents WHERE severity = 'critical')::integer,
    (SELECT count(*) FROM incidents WHERE severity = 'high')::integer,
    (SELECT count(*) FROM incidents WHERE severity = 'medium')::integer,
    (SELECT count(*) FROM incidents WHERE severity = 'low')::integer,
    (SELECT count(*) FROM incidents WHERE severity = 'info')::integer,
    (SELECT count(*) FROM itap.devices d WHERE d.organization_id = org AND d.status <> 'inactive'
       AND (d.health_status = 'critical' OR d.status = 'connection_error'))::integer,
    ((SELECT count(*) FROM itap.notification_deliveries d
      WHERE d.organization_id = org AND d.status IN ('failed', 'dead_letter') AND d.created_at >= now() - interval '24 hours'
        AND (d.subscription_id IS NULL OR d.recipient_user_id = me))
     + (SELECT count(*) FROM itap.webhook_deliveries w
        WHERE w.organization_id = org AND w.status IN ('failed', 'dead_letter') AND w.created_at >= now() - interval '24 hours'))::integer,
    coalesce((SELECT jsonb_agg(jsonb_build_object('segment_id', m.id, 'code', m.code, 'name', m.name,
                                                  'member_count', m.member_count, 'previous_count', m.previous_count,
                                                  'change', m.change)
                               ORDER BY abs(m.change) DESC, m.name)
              FROM movers m), '[]'::jsonb);
END;
$$;
