-- Slice 10 task 1 fix round 1: activity stats (identity_activity_stats / profile_activity_stats, segment inputs) skip
-- people with restricted processing; their rows are removed by the next refresh. From the latest definition (1792365700090); additive.
CREATE OR REPLACE FUNCTION itap.refresh_activity_stats(p_org uuid, p_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('activity_stats:' || p_org::text, 0));

  -- One statement per table: upsert the subjects' rows, delete every other row of the organization (subjects no
  -- longer qualifying, e.g. merged identities or unlinked profiles), whatever its as_of.
  -- Identities of a profile with restricted processing get no row (slice 10).
  WITH r AS MATERIALIZED (
    SELECT x.* FROM itap.activity_stats_rows(p_org, p_at, false) x
    WHERE NOT EXISTS (
      SELECT 1 FROM itap.identities i JOIN itap.profiles p ON p.organization_id = i.organization_id AND p.id = i.profile_id
      WHERE i.organization_id = p_org AND i.id = x.subject_id AND p.processing_restricted)
  ),
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

  -- Profiles with restricted processing get no row (slice 10).
  WITH r AS MATERIALIZED (
    SELECT x.* FROM itap.activity_stats_rows(p_org, p_at, true) x
    WHERE NOT EXISTS (SELECT 1 FROM itap.profiles p WHERE p.organization_id = p_org AND p.id = x.subject_id AND p.processing_restricted)
  ),
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
$function$
;
