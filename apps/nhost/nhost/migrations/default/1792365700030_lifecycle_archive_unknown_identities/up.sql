-- Daily lifecycle job (spec §8.3 lifecycle_jobs), one organization at a time at the cron's scheduled time `p_at`
-- (never now(), so a retried run is a no-op; every step only touches rows still in the old state):
--   * visits still `scheduled` (never checked in) with expected_end < p_at  -> no_show
--   * visitor / contractor profiles with status active and end_date before p_at's date in the organization's
--     timezone -> inactive (end_date is the last valid day)
--   * pending organization invitations with expires_at < p_at -> expired
-- Returns the visits set to no_show (Hasura needs a table type; the other counts are visible in the tables).
-- Unknown identities (no profile, status unverified / pending_verification) with coalesce(last_seen_at, created_at)
-- older than organization_settings.archive_unknown_after_days before p_at -> archived, each under the identity
-- advisory lock taken in id order (same lock as Stage A and close_stale_sessions). Rows are locked in id order. Admin-only (backend cron handler).
-- Replaces the previous definition (adds the identity archive step).
CREATE OR REPLACE FUNCTION itap.run_lifecycle_jobs(p_organization uuid, p_at timestamptz) RETURNS SETOF itap.visits
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org_timezone text;
  local_date date;
  archive_days integer;
  candidate uuid;
BEGIN
  SELECT o.timezone INTO org_timezone FROM itap.organizations o WHERE o.id = p_organization;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  local_date := (p_at AT TIME ZONE org_timezone)::date;

  SELECT st.archive_unknown_after_days INTO archive_days
  FROM itap.organization_settings st WHERE st.organization_id = p_organization;
  IF archive_days IS NOT NULL THEN
    FOR candidate IN
      SELECT x.id FROM itap.identities x
      WHERE x.organization_id = p_organization AND x.profile_id IS NULL
        AND x.status IN ('unverified', 'pending_verification')
        AND coalesce(x.last_seen_at, x.created_at) < p_at - make_interval(days => archive_days)
      ORDER BY x.id
    LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended('identity:' || candidate::text, 0));
      -- Re-check under the lock (a detection or a link may have changed the identity meanwhile).
      UPDATE itap.identities i SET status = 'archived'
      WHERE i.organization_id = p_organization AND i.id = candidate AND i.profile_id IS NULL
        AND i.status IN ('unverified', 'pending_verification')
        AND coalesce(i.last_seen_at, i.created_at) < p_at - make_interval(days => archive_days);
    END LOOP;
  END IF;

  UPDATE itap.profiles p SET status = 'inactive'
  WHERE p.id IN (
    SELECT x.id FROM itap.profiles x
    WHERE x.organization_id = p_organization AND x.profile_type IN ('visitor', 'contractor')
      AND x.status = 'active' AND x.end_date < local_date
    ORDER BY x.id FOR UPDATE
  );

  UPDATE itap.organization_invitations i SET status = 'expired'
  WHERE i.id IN (
    SELECT x.id FROM itap.organization_invitations x
    WHERE x.organization_id = p_organization AND x.status = 'pending' AND x.expires_at < p_at
    ORDER BY x.id FOR UPDATE
  );

  RETURN QUERY
  UPDATE itap.visits v SET status = 'no_show'
  WHERE v.id IN (
    SELECT x.id FROM itap.visits x
    WHERE x.organization_id = p_organization AND x.status = 'scheduled' AND x.checked_in_at IS NULL
      AND x.expected_end < p_at
    ORDER BY x.id FOR UPDATE
  )
  RETURNING v.*;
END;
$$;
