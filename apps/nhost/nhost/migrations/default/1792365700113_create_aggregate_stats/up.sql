-- Stats aggregation writers (spec §8.3 aggregate_stats, plan-07 task 1), admin secret only.
-- itap.aggregate_stats_range(org, from, to) (re)aggregates every complete UTC hour in [from, to) (from rounded up,
-- to rounded down to the hour) in one set-based pass: hourly rows of those hours, facility daily rows and area
-- transitions of the facility-local days they touch (each whole day, with the data present). Every bucket
-- in range is upserted (unchanged rows are not rewritten) and rows of those buckets that no longer have data are
-- deleted, so re-running a range is idempotent and a range equals calling aggregate_stats hour by hour in ascending
-- order. itap.aggregate_stats(org, at) = the range [hour(at) - 1 h, hour(at)) (the last complete hour before at; the
-- cron passes its scheduled time). Activity stats (run_activity_stats) are NOT refreshed here: the hourly
-- evaluate_segments cron does it (no double run). Serialised per organization by an advisory lock.

CREATE TABLE itap_results.stats_aggregations (
  organization_id uuid NOT NULL,
  hour_from timestamptz NOT NULL,
  hour_to timestamptz NOT NULL,
  hourly_rows integer NOT NULL,
  daily_rows integer NOT NULL,
  transition_rows integer NOT NULL
);

CREATE FUNCTION itap.aggregate_stats_range(p_organization uuid, p_from timestamptz, p_to timestamptz)
RETURNS SETOF itap_results.stats_aggregations
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  hour_from timestamptz;
  hour_to timestamptz;
  n_hourly integer := 0;
  n_daily integer := 0;
  n_transitions integer := 0;
BEGIN
  IF p_from IS NULL OR p_to IS NULL THEN
    PERFORM itap.raise_code('stats_period_invalid');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM itap.organizations o WHERE o.id = p_organization) THEN
    RETURN;
  END IF;
  hour_from := itap.hour_floor(p_from);
  IF hour_from < p_from THEN
    hour_from := hour_from + interval '1 hour';
  END IF;
  hour_to := itap.hour_floor(p_to);
  IF hour_from >= hour_to THEN
    RETURN QUERY SELECT p_organization, hour_from, hour_to, 0, 0, 0;
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('aggregate_stats:' || p_organization::text, 0));

  WITH r AS MATERIALIZED (SELECT * FROM itap.stats_hourly_rows(p_organization, hour_from, hour_to)),
  up AS (
    INSERT INTO itap.area_hourly_stats AS t
      (organization_id, facility_id, area_id, hour, unique_identities, entries, exits, dwell_seconds,
       avg_dwell_seconds, peak_occupancy)
    SELECT p_organization, r.facility_id, r.area_id, r.hour, r.unique_identities, r.entries, r.exits,
           r.dwell_seconds, r.avg_dwell_seconds, r.peak_occupancy
    FROM r ORDER BY r.hour, r.facility_id, r.area_id
    ON CONFLICT ON CONSTRAINT area_hourly_stats_bucket_key DO UPDATE SET
      unique_identities = EXCLUDED.unique_identities, entries = EXCLUDED.entries, exits = EXCLUDED.exits,
      dwell_seconds = EXCLUDED.dwell_seconds, avg_dwell_seconds = EXCLUDED.avg_dwell_seconds,
      peak_occupancy = EXCLUDED.peak_occupancy
    WHERE (t.unique_identities, t.entries, t.exits, t.dwell_seconds, t.avg_dwell_seconds, t.peak_occupancy)
      IS DISTINCT FROM (EXCLUDED.unique_identities, EXCLUDED.entries, EXCLUDED.exits, EXCLUDED.dwell_seconds,
                        EXCLUDED.avg_dwell_seconds, EXCLUDED.peak_occupancy)
    RETURNING 1
  ),
  gone AS (
    DELETE FROM itap.area_hourly_stats t
    WHERE t.organization_id = p_organization AND t.hour >= hour_from AND t.hour < hour_to
      AND NOT EXISTS (SELECT 1 FROM r WHERE r.facility_id = t.facility_id AND r.area_id IS NOT DISTINCT FROM t.area_id
                                       AND r.hour = t.hour)
    RETURNING 1
  )
  SELECT count(*) INTO n_hourly FROM r;

  WITH days AS MATERIALIZED (SELECT * FROM itap.stats_days(p_organization, hour_from, hour_to)),
  r AS MATERIALIZED (SELECT * FROM itap.stats_daily_rows(p_organization, hour_from, hour_to)),
  up AS (
    INSERT INTO itap.facility_daily_stats AS t
      (organization_id, facility_id, day, unique_identities, known_identities, unknown_identities, visits,
       guest_visits, avg_visit_minutes, dwell_seconds, peak_occupancy, peak_hour)
    SELECT p_organization, r.facility_id, r.day, r.unique_identities, r.known_identities, r.unknown_identities,
           r.visits, r.guest_visits, r.avg_visit_minutes, r.dwell_seconds, r.peak_occupancy, r.peak_hour
    FROM r ORDER BY r.facility_id, r.day
    ON CONFLICT ON CONSTRAINT facility_daily_stats_bucket_key DO UPDATE SET
      unique_identities = EXCLUDED.unique_identities, known_identities = EXCLUDED.known_identities,
      unknown_identities = EXCLUDED.unknown_identities, visits = EXCLUDED.visits,
      guest_visits = EXCLUDED.guest_visits, avg_visit_minutes = EXCLUDED.avg_visit_minutes,
      dwell_seconds = EXCLUDED.dwell_seconds, peak_occupancy = EXCLUDED.peak_occupancy,
      peak_hour = EXCLUDED.peak_hour
    WHERE (t.unique_identities, t.known_identities, t.unknown_identities, t.visits, t.guest_visits,
           t.avg_visit_minutes, t.dwell_seconds, t.peak_occupancy, t.peak_hour)
      IS DISTINCT FROM (EXCLUDED.unique_identities, EXCLUDED.known_identities, EXCLUDED.unknown_identities,
                        EXCLUDED.visits, EXCLUDED.guest_visits, EXCLUDED.avg_visit_minutes, EXCLUDED.dwell_seconds,
                        EXCLUDED.peak_occupancy, EXCLUDED.peak_hour)
    RETURNING 1
  ),
  gone AS (
    DELETE FROM itap.facility_daily_stats t
    USING days d
    WHERE t.organization_id = p_organization AND t.facility_id = d.facility_id AND t.day = d.day
      AND NOT EXISTS (SELECT 1 FROM r WHERE r.facility_id = t.facility_id AND r.day = t.day)
    RETURNING 1
  )
  SELECT count(*) INTO n_daily FROM r;

  WITH days AS MATERIALIZED (SELECT * FROM itap.stats_days(p_organization, hour_from, hour_to)),
  r AS MATERIALIZED (SELECT * FROM itap.stats_transition_rows(p_organization, hour_from, hour_to)),
  up AS (
    INSERT INTO itap.area_transitions_daily AS t (organization_id, facility_id, day, from_area_id, to_area_id, count)
    SELECT p_organization, r.facility_id, r.day, r.from_area_id, r.to_area_id, r.count
    FROM r ORDER BY r.facility_id, r.day, r.from_area_id, r.to_area_id
    ON CONFLICT ON CONSTRAINT area_transitions_daily_bucket_key DO UPDATE SET count = EXCLUDED.count
    WHERE t.count IS DISTINCT FROM EXCLUDED.count
    RETURNING 1
  ),
  gone AS (
    DELETE FROM itap.area_transitions_daily t
    USING days d
    WHERE t.organization_id = p_organization AND t.facility_id = d.facility_id AND t.day = d.day
      AND NOT EXISTS (SELECT 1 FROM r WHERE r.facility_id = t.facility_id AND r.day = t.day
                                       AND r.from_area_id = t.from_area_id AND r.to_area_id = t.to_area_id)
    RETURNING 1
  )
  SELECT count(*) INTO n_transitions FROM r;

  RETURN QUERY SELECT p_organization, hour_from, hour_to, n_hourly, n_daily, n_transitions;
END;
$$;

CREATE FUNCTION itap.aggregate_stats(p_organization uuid, p_at timestamptz)
RETURNS SETOF itap_results.stats_aggregations
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF p_at IS NULL THEN
    PERFORM itap.raise_code('stats_period_invalid');
  END IF;
  RETURN QUERY
  SELECT * FROM itap.aggregate_stats_range(p_organization, itap.hour_floor(p_at) - interval '1 hour', itap.hour_floor(p_at));
END;
$$;
