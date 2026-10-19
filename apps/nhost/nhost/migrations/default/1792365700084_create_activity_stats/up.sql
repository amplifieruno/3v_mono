-- Behavioral metrics per identity and per profile (spec §6.10; read by segment conditions, §6.5). Read-only,
-- not audited (derived). One row per subject that was ever seen before as_of (profiles: rolled up over the
-- identities currently linked to them); a subject without a row has null metrics, so every metric comparison in a
-- segment condition is false for it. Written only by itap.refresh_activity_stats (slice 7's aggregate_stats cron
-- reuses it).
CREATE TABLE itap.identity_activity_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  identity_id uuid NOT NULL,
  visits_last_30d integer NOT NULL DEFAULT 0,
  avg_dwell_minutes numeric(10, 2),
  last_seen_at timestamptz,
  after_hours_visits_30d integer NOT NULL DEFAULT 0,
  top_area_id uuid,
  as_of timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_activity_stats_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT identity_activity_stats_organization_id_identity_id_key UNIQUE (organization_id, identity_id),
  CONSTRAINT identity_activity_stats_counts_nonnegative CHECK (visits_last_30d >= 0 AND after_hours_visits_30d >= 0),
  CONSTRAINT identity_activity_stats_identity_fkey FOREIGN KEY (organization_id, identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT identity_activity_stats_top_area_fkey FOREIGN KEY (organization_id, top_area_id)
    REFERENCES itap.areas (organization_id, id) ON DELETE SET NULL (top_area_id)
);
CREATE INDEX identity_activity_stats_organization_id_top_area_id_idx ON itap.identity_activity_stats (organization_id, top_area_id);
CREATE TRIGGER identity_activity_stats_set_updated_at BEFORE UPDATE ON itap.identity_activity_stats
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();

CREATE TABLE itap.profile_activity_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  visits_last_30d integer NOT NULL DEFAULT 0,
  avg_dwell_minutes numeric(10, 2),
  last_seen_at timestamptz,
  after_hours_visits_30d integer NOT NULL DEFAULT 0,
  top_area_id uuid,
  as_of timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_activity_stats_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT profile_activity_stats_organization_id_profile_id_key UNIQUE (organization_id, profile_id),
  CONSTRAINT profile_activity_stats_counts_nonnegative CHECK (visits_last_30d >= 0 AND after_hours_visits_30d >= 0),
  CONSTRAINT profile_activity_stats_profile_fkey FOREIGN KEY (organization_id, profile_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT profile_activity_stats_top_area_fkey FOREIGN KEY (organization_id, top_area_id)
    REFERENCES itap.areas (organization_id, id) ON DELETE SET NULL (top_area_id)
);
CREATE INDEX profile_activity_stats_organization_id_top_area_id_idx ON itap.profile_activity_stats (organization_id, top_area_id);
CREATE TRIGGER profile_activity_stats_set_updated_at BEFORE UPDATE ON itap.profile_activity_stats
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();

-- Metrics as of p_at, per identity (p_by_profile false) or per currently linked profile (true). Window: the 30
-- days before p_at. A visit = a distinct (facility, local day) with a tracking session start in the window;
-- dwell = session length capped at p_at (open sessions count up to their last detection); last_seen_at = latest
-- detection of any session started before p_at (not limited to the window); after-hours visits = after_hours
-- events in the window; top area = the area entered most often in the window (identity_locations; ties: lowest id).
CREATE FUNCTION itap.activity_stats_rows(p_org uuid, p_at timestamptz, p_by_profile boolean)
RETURNS TABLE (subject_id uuid, visits integer, avg_dwell numeric, last_seen timestamptz, after_hours integer, top_area uuid)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH subjects AS (
    SELECT i.id AS identity_id, CASE WHEN p_by_profile THEN i.profile_id ELSE i.id END AS subject_id
    FROM itap.identities i
    WHERE i.organization_id = p_org AND (NOT p_by_profile OR i.profile_id IS NOT NULL)
  ),
  sessions AS (
    SELECT sub.subject_id, s.started_at, s.facility_id,
           (s.started_at AT TIME ZONE coalesce(f.timezone, 'UTC'))::date AS local_day,
           least(coalesce(s.ended_at, s.last_detected_at), p_at) - s.started_at AS dwell,
           least(s.last_detected_at, p_at) AS seen
    FROM itap.tracking_sessions s
    JOIN subjects sub ON sub.identity_id = s.identity_id
    LEFT JOIN itap.facilities f ON f.organization_id = s.organization_id AND f.id = s.facility_id
    WHERE s.organization_id = p_org AND s.started_at < p_at
  ),
  per_subject AS (
    SELECT subject_id,
           count(DISTINCT coalesce(facility_id::text, '') || '/' || local_day::text)
             FILTER (WHERE started_at >= p_at - interval '30 days')::integer AS visits,
           round((avg(extract(epoch FROM dwell)) FILTER (WHERE started_at >= p_at - interval '30 days')) / 60, 2) AS avg_dwell,
           max(seen) AS last_seen
    FROM sessions
    GROUP BY subject_id
  ),
  after_hours AS (
    SELECT sub.subject_id, count(*)::integer AS n
    FROM itap.events e
    JOIN subjects sub ON sub.identity_id = e.identity_id
    WHERE e.organization_id = p_org AND e.event_type = 'after_hours'
      AND e.occurred_at >= p_at - interval '30 days' AND e.occurred_at < p_at
    GROUP BY sub.subject_id
  ),
  top_areas AS (
    SELECT DISTINCT ON (sub.subject_id) sub.subject_id, l.area_id
    FROM itap.identity_locations l
    JOIN subjects sub ON sub.identity_id = l.identity_id
    WHERE l.organization_id = p_org AND l.area_id IS NOT NULL
      AND l.occurred_at >= p_at - interval '30 days' AND l.occurred_at < p_at
    GROUP BY sub.subject_id, l.area_id
    ORDER BY sub.subject_id, count(*) DESC, l.area_id
  )
  SELECT p.subject_id, p.visits, p.avg_dwell, p.last_seen, coalesce(h.n, 0), t.area_id
  FROM per_subject p
  LEFT JOIN after_hours h ON h.subject_id = p.subject_id
  LEFT JOIN top_areas t ON t.subject_id = p.subject_id;
$$;

-- Recomputes both stats tables of the organization as of p_at (idempotent upsert; rows of subjects no longer
-- qualifying are removed). Serialized per organization.
CREATE FUNCTION itap.refresh_activity_stats(p_org uuid, p_at timestamptz) RETURNS void
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('activity_stats:' || p_org::text, 0));

  INSERT INTO itap.identity_activity_stats AS t
    (organization_id, identity_id, visits_last_30d, avg_dwell_minutes, last_seen_at, after_hours_visits_30d, top_area_id, as_of)
  SELECT p_org, r.subject_id, r.visits, r.avg_dwell, r.last_seen, r.after_hours, r.top_area, p_at
  FROM itap.activity_stats_rows(p_org, p_at, false) r
  ORDER BY r.subject_id
  ON CONFLICT (organization_id, identity_id) DO UPDATE SET
    visits_last_30d = EXCLUDED.visits_last_30d, avg_dwell_minutes = EXCLUDED.avg_dwell_minutes,
    last_seen_at = EXCLUDED.last_seen_at, after_hours_visits_30d = EXCLUDED.after_hours_visits_30d,
    top_area_id = EXCLUDED.top_area_id, as_of = EXCLUDED.as_of;
  DELETE FROM itap.identity_activity_stats t WHERE t.organization_id = p_org AND t.as_of <> p_at;

  INSERT INTO itap.profile_activity_stats AS t
    (organization_id, profile_id, visits_last_30d, avg_dwell_minutes, last_seen_at, after_hours_visits_30d, top_area_id, as_of)
  SELECT p_org, r.subject_id, r.visits, r.avg_dwell, r.last_seen, r.after_hours, r.top_area, p_at
  FROM itap.activity_stats_rows(p_org, p_at, true) r
  ORDER BY r.subject_id
  ON CONFLICT (organization_id, profile_id) DO UPDATE SET
    visits_last_30d = EXCLUDED.visits_last_30d, avg_dwell_minutes = EXCLUDED.avg_dwell_minutes,
    last_seen_at = EXCLUDED.last_seen_at, after_hours_visits_30d = EXCLUDED.after_hours_visits_30d,
    top_area_id = EXCLUDED.top_area_id, as_of = EXCLUDED.as_of;
  DELETE FROM itap.profile_activity_stats t WHERE t.organization_id = p_org AND t.as_of <> p_at;
END;
$$;
