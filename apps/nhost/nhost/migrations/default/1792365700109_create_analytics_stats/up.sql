-- Analytics stats (spec §6.10, plan-07 task 1). Read-only for org_admin, not audited (derived, high volume), unique
-- per bucket, written only by itap.aggregate_stats / itap.aggregate_stats_range (upsert of every bucket in range,
-- stale rows of those buckets deleted, so re-aggregation is idempotent). Rows exist only for buckets with activity.
-- FKs to facilities / areas CASCADE: the rows are re-computable derivations of tracking history, not history
-- themselves.

-- Hourly buckets (UTC hours). area_id NULL = the facility total (presence in any area or none, from the tracking
-- session); otherwise the area where the identity was located (direct area of the location, no roll-up to parent
-- areas). Model (see itap.stats_presence):
--   presence interval in an area: from the location that entered it to the next location in another area of the
--     same session, or to the session end (ended_at, or last_detected_at while active);
--   unique_identities: effective identities (merge targets) present in the hour;
--   entries / exits: intervals starting / ending in the hour (the end of an active session is not an exit);
--   dwell_seconds: presence seconds inside the hour (overlapping intervals of one effective identity counted once);
--   avg_dwell_seconds: dwell_seconds / unique_identities (rounded); peak_occupancy: max concurrent effective
--   identities at any instant of the hour.
CREATE TABLE itap.area_hourly_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  facility_id uuid NOT NULL,
  area_id uuid,
  hour timestamptz NOT NULL,
  unique_identities integer NOT NULL DEFAULT 0,
  entries integer NOT NULL DEFAULT 0,
  exits integer NOT NULL DEFAULT 0,
  dwell_seconds integer NOT NULL DEFAULT 0,
  avg_dwell_seconds integer,
  peak_occupancy integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT area_hourly_stats_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT area_hourly_stats_bucket_key UNIQUE NULLS NOT DISTINCT (organization_id, facility_id, area_id, hour),
  CONSTRAINT area_hourly_stats_hour_aligned CHECK (extract(epoch FROM hour)::bigint % 3600 = 0),
  CONSTRAINT area_hourly_stats_counts_nonnegative CHECK (
    unique_identities >= 0 AND entries >= 0 AND exits >= 0 AND dwell_seconds >= 0 AND peak_occupancy >= 0
  ),
  CONSTRAINT area_hourly_stats_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT area_hourly_stats_area_fkey FOREIGN KEY (organization_id, facility_id, area_id)
    REFERENCES itap.areas (organization_id, facility_id, id) ON DELETE CASCADE
);
CREATE INDEX area_hourly_stats_organization_id_hour_idx ON itap.area_hourly_stats (organization_id, hour);
CREATE TRIGGER area_hourly_stats_set_updated_at BEFORE UPDATE ON itap.area_hourly_stats
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();

-- Daily buckets: facility-local days (facility timezone), over the whole day with the data present when aggregated
-- (a day in progress counts everything ingested so far; re-aggregation never regresses a day).
--   unique / known / unknown_identities: effective identities present that day; known = linked to a profile at
--     aggregation time;
--   visits: tracking sessions started that day; avg_visit_minutes: their mean length (end = ended_at, or
--     last_detected_at while active);
--   guest_visits: visits (itap.visits) of the facility checked in that day;
--   dwell_seconds: facility presence seconds within the day;
--   peak_occupancy: max concurrent effective identities; peak_hour: local hour of the first instant at the peak
--     (NULL when nobody was present).
CREATE TABLE itap.facility_daily_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  facility_id uuid NOT NULL,
  day date NOT NULL,
  unique_identities integer NOT NULL DEFAULT 0,
  known_identities integer NOT NULL DEFAULT 0,
  unknown_identities integer NOT NULL DEFAULT 0,
  visits integer NOT NULL DEFAULT 0,
  guest_visits integer NOT NULL DEFAULT 0,
  avg_visit_minutes numeric(10, 2),
  dwell_seconds integer NOT NULL DEFAULT 0,
  peak_occupancy integer NOT NULL DEFAULT 0,
  peak_hour smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facility_daily_stats_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT facility_daily_stats_bucket_key UNIQUE (organization_id, facility_id, day),
  CONSTRAINT facility_daily_stats_counts_nonnegative CHECK (
    unique_identities >= 0 AND known_identities >= 0 AND unknown_identities >= 0 AND visits >= 0
    AND guest_visits >= 0 AND dwell_seconds >= 0 AND peak_occupancy >= 0
  ),
  CONSTRAINT facility_daily_stats_known_split CHECK (known_identities + unknown_identities = unique_identities),
  CONSTRAINT facility_daily_stats_peak_hour_range CHECK (peak_hour IS NULL OR peak_hour BETWEEN 0 AND 23),
  CONSTRAINT facility_daily_stats_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX facility_daily_stats_organization_id_day_idx ON itap.facility_daily_stats (organization_id, day);
CREATE TRIGGER facility_daily_stats_set_updated_at BEFORE UPDATE ON itap.facility_daily_stats
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();

-- Area-to-area movements per facility-local day: consecutive area intervals of one session (the second one starts
-- that day). Read by flow_matrix and by Stage B abnormal_movement (30 days before the detection's local day).
CREATE TABLE itap.area_transitions_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  facility_id uuid NOT NULL,
  day date NOT NULL,
  from_area_id uuid NOT NULL,
  to_area_id uuid NOT NULL,
  count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT area_transitions_daily_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT area_transitions_daily_bucket_key UNIQUE (organization_id, facility_id, day, from_area_id, to_area_id),
  CONSTRAINT area_transitions_daily_count_positive CHECK (count > 0),
  CONSTRAINT area_transitions_daily_distinct_areas CHECK (from_area_id <> to_area_id),
  CONSTRAINT area_transitions_daily_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT area_transitions_daily_from_area_fkey FOREIGN KEY (organization_id, facility_id, from_area_id)
    REFERENCES itap.areas (organization_id, facility_id, id) ON DELETE CASCADE,
  CONSTRAINT area_transitions_daily_to_area_fkey FOREIGN KEY (organization_id, facility_id, to_area_id)
    REFERENCES itap.areas (organization_id, facility_id, id) ON DELETE CASCADE
);
CREATE INDEX area_transitions_daily_from_area_idx
  ON itap.area_transitions_daily (organization_id, facility_id, from_area_id, to_area_id, day);
CREATE INDEX area_transitions_daily_to_area_idx ON itap.area_transitions_daily (organization_id, facility_id, to_area_id, day);
CREATE INDEX area_transitions_daily_organization_id_day_idx ON itap.area_transitions_daily (organization_id, day);
CREATE TRIGGER area_transitions_daily_set_updated_at BEFORE UPDATE ON itap.area_transitions_daily
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
