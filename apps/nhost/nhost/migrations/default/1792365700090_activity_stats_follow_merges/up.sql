-- Activity stats follow identity merges (review round 1): each identity's history counts for its effective
-- identity (completed merges followed source -> target, chains included); merged identities get no rows (the
-- refresh deletes their stale rows); profile stats roll up the effective identities linked to the profile, so the
-- history of identities merged into them counts. Top area counts area entries only (movement_type entry).
CREATE OR REPLACE FUNCTION itap.activity_stats_rows(p_org uuid, p_at timestamptz, p_by_profile boolean)
RETURNS TABLE (subject_id uuid, visits integer, avg_dwell numeric, last_seen timestamptz, after_hours integer, top_area uuid)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH RECURSIVE hops AS (
    -- source -> target of completed merges (a merged identity is never a target, so chains end).
    SELECT s.source_identity_id AS id, m.target_identity_id AS target
    FROM itap.identity_merge_sources s
    JOIN itap.identity_merges m ON m.organization_id = s.organization_id AND m.id = s.merge_id
    WHERE s.organization_id = p_org AND m.status = 'completed'
  ),
  chain (identity_id, current_id, depth) AS (
    SELECT i.id, i.id, 0 FROM itap.identities i WHERE i.organization_id = p_org
    UNION ALL
    SELECT c.identity_id, h.target, c.depth + 1 FROM chain c JOIN hops h ON h.id = c.current_id WHERE c.depth < 32
  ),
  effective AS (
    SELECT DISTINCT ON (identity_id) identity_id, current_id AS effective_id
    FROM chain ORDER BY identity_id, depth DESC
  ),
  subjects AS (
    -- Every identity's history belongs to its effective (unmerged) identity, and to that identity's profile.
    SELECT e.identity_id, CASE WHEN p_by_profile THEN t.profile_id ELSE t.id END AS subject_id
    FROM effective e
    JOIN itap.identities t ON t.organization_id = p_org AND t.id = e.effective_id
    WHERE t.status <> 'merged' AND (NOT p_by_profile OR t.profile_id IS NOT NULL)
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
    WHERE l.organization_id = p_org AND l.area_id IS NOT NULL AND l.movement_type = 'entry'
      AND l.occurred_at >= p_at - interval '30 days' AND l.occurred_at < p_at
    GROUP BY sub.subject_id, l.area_id
    ORDER BY sub.subject_id, count(*) DESC, l.area_id
  )
  SELECT p.subject_id, p.visits, p.avg_dwell, p.last_seen, coalesce(h.n, 0), t.area_id
  FROM per_subject p
  LEFT JOIN after_hours h ON h.subject_id = p.subject_id
  LEFT JOIN top_areas t ON t.subject_id = p.subject_id;
$$;

CREATE OR REPLACE FUNCTION itap.refresh_activity_stats(p_org uuid, p_at timestamptz) RETURNS void
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('activity_stats:' || p_org::text, 0));

  -- One statement per table: upsert the subjects' rows, delete every other row of the organization (subjects no
  -- longer qualifying, e.g. merged identities or unlinked profiles), whatever its as_of.
  WITH r AS MATERIALIZED (SELECT * FROM itap.activity_stats_rows(p_org, p_at, false)),
  up AS (
    INSERT INTO itap.identity_activity_stats AS t
      (organization_id, identity_id, visits_last_30d, avg_dwell_minutes, last_seen_at, after_hours_visits_30d, top_area_id, as_of)
    SELECT p_org, r.subject_id, r.visits, r.avg_dwell, r.last_seen, r.after_hours, r.top_area, p_at
    FROM r ORDER BY r.subject_id
    ON CONFLICT (organization_id, identity_id) DO UPDATE SET
      visits_last_30d = EXCLUDED.visits_last_30d, avg_dwell_minutes = EXCLUDED.avg_dwell_minutes,
      last_seen_at = EXCLUDED.last_seen_at, after_hours_visits_30d = EXCLUDED.after_hours_visits_30d,
      top_area_id = EXCLUDED.top_area_id, as_of = EXCLUDED.as_of
    RETURNING 1
  )
  DELETE FROM itap.identity_activity_stats t
  WHERE t.organization_id = p_org AND NOT EXISTS (SELECT 1 FROM r WHERE r.subject_id = t.identity_id);

  WITH r AS MATERIALIZED (SELECT * FROM itap.activity_stats_rows(p_org, p_at, true)),
  up AS (
    INSERT INTO itap.profile_activity_stats AS t
      (organization_id, profile_id, visits_last_30d, avg_dwell_minutes, last_seen_at, after_hours_visits_30d, top_area_id, as_of)
    SELECT p_org, r.subject_id, r.visits, r.avg_dwell, r.last_seen, r.after_hours, r.top_area, p_at
    FROM r ORDER BY r.subject_id
    ON CONFLICT (organization_id, profile_id) DO UPDATE SET
      visits_last_30d = EXCLUDED.visits_last_30d, avg_dwell_minutes = EXCLUDED.avg_dwell_minutes,
      last_seen_at = EXCLUDED.last_seen_at, after_hours_visits_30d = EXCLUDED.after_hours_visits_30d,
      top_area_id = EXCLUDED.top_area_id, as_of = EXCLUDED.as_of
    RETURNING 1
  )
  DELETE FROM itap.profile_activity_stats t
  WHERE t.organization_id = p_org AND NOT EXISTS (SELECT 1 FROM r WHERE r.subject_id = t.profile_id);
END;
$$;
