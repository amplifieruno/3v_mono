-- Previous definition (1792365700090_activity_stats_follow_merges).
CREATE OR REPLACE FUNCTION itap.refresh_activity_stats(p_org uuid, p_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
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
$function$
;
