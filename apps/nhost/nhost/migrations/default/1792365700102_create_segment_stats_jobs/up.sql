-- Hourly segment jobs (slice 6 task 3, cron `evaluate_segments`): per organization at the scheduled time
-- (1) itap.run_activity_stats -> refresh_activity_stats (behavioral metrics), (2) the backend evaluates every dynamic
-- segment, (3) itap.refresh_segment_daily_stats. Both functions are admin-only (cron handler) and idempotent for the
-- same p_at.

-- Row type of itap.run_activity_stats (stores nothing).
CREATE TABLE itap_results.activity_stats_refreshes (
  organization_id uuid NOT NULL,
  refreshed_at timestamptz NOT NULL,
  identity_rows integer NOT NULL,
  profile_rows integer NOT NULL
);

CREATE FUNCTION itap.run_activity_stats(p_organization uuid, p_at timestamptz)
RETURNS SETOF itap_results.activity_stats_refreshes
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF p_at IS NULL THEN
    PERFORM itap.raise_code('segment_evaluation_time_required');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM itap.organizations o WHERE o.id = p_organization) THEN
    RETURN;
  END IF;
  PERFORM itap.refresh_activity_stats(p_organization, p_at);
  RETURN QUERY
  SELECT p_organization, p_at,
         (SELECT count(*)::integer FROM itap.identity_activity_stats s WHERE s.organization_id = p_organization),
         (SELECT count(*)::integer FROM itap.profile_activity_stats s WHERE s.organization_id = p_organization);
END;
$$;

-- Daily trend and churn (spec §6.5, SA_3) for the organization-local day of p_at and of p_at - 1 hour (the first run
-- of a day finishes the previous one), for every segment of the organization:
--   member_count  open rows at p_at; for a finished day, at its end;
--   added         rows opened during the day (up to p_at);
--   removed       rows closed during the day (up to p_at);
-- a row closed and another row of the same segment and subject opened at the same instant are a continuation, not
-- churn (manual pin of a rule member: add_segment_members and the merge pin close the rule row and open the manual
-- one at one timestamp; a rule row reopened at a manual removal time by sync's no-overlap clamp), so neither counts.
CREATE FUNCTION itap.refresh_segment_daily_stats(p_organization uuid, p_at timestamptz)
RETURNS SETOF itap.segment_daily_stats
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  tz text;
BEGIN
  IF p_at IS NULL THEN
    PERFORM itap.raise_code('segment_evaluation_time_required');
  END IF;
  SELECT o.timezone INTO tz FROM itap.organizations o WHERE o.id = p_organization;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH days AS (
    SELECT DISTINCT d AS day
    FROM unnest(ARRAY[((p_at - interval '1 hour') AT TIME ZONE tz)::date, (p_at AT TIME ZONE tz)::date]) d
  ),
  bounds AS (
    -- [day_start, cutoff]: cutoff = p_at inside the day, else the last instant of the day.
    SELECT day, day::timestamp AT TIME ZONE tz AS day_start,
           least(p_at, ((day + 1)::timestamp AT TIME ZONE tz) - interval '1 microsecond') AS cutoff
    FROM days
  ),
  members AS (
    SELECT m.id, m.segment_id, coalesce(m.identity_id, m.profile_id) AS subject, m.added_at, m.removed_at
    FROM itap.segment_members m WHERE m.organization_id = p_organization
  ),
  handoffs AS (
    -- (closed row, opened row) pairs at one instant for one subject.
    SELECT c.id AS closed_id, o.id AS opened_id
    FROM members c
    JOIN members o ON o.segment_id = c.segment_id AND o.subject = c.subject AND o.id <> c.id AND o.added_at = c.removed_at
  ),
  numbers AS (
    SELECT s.id AS segment_id, b.day,
           count(*) FILTER (WHERE m.added_at <= b.cutoff AND (m.removed_at IS NULL OR m.removed_at > b.cutoff))::integer AS member_count,
           count(*) FILTER (WHERE m.added_at >= b.day_start AND m.added_at <= b.cutoff
                            AND NOT EXISTS (SELECT 1 FROM handoffs h WHERE h.opened_id = m.id))::integer AS added,
           count(*) FILTER (WHERE m.removed_at >= b.day_start AND m.removed_at <= b.cutoff
                            AND NOT EXISTS (SELECT 1 FROM handoffs h WHERE h.closed_id = m.id))::integer AS removed
    FROM itap.segments s
    CROSS JOIN bounds b
    LEFT JOIN members m ON m.segment_id = s.id
    WHERE s.organization_id = p_organization
    GROUP BY s.id, b.day
  )
  INSERT INTO itap.segment_daily_stats AS t (organization_id, segment_id, day, member_count, added, removed)
  SELECT p_organization, n.segment_id, n.day, n.member_count, n.added, n.removed
  FROM numbers n
  ORDER BY n.segment_id, n.day
  ON CONFLICT (organization_id, segment_id, day) DO UPDATE SET
    member_count = EXCLUDED.member_count, added = EXCLUDED.added, removed = EXCLUDED.removed
  RETURNING t.*;
END;
$$;
