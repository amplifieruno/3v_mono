-- Slice 10 task 2 fix round 1: the backend drain claims queued file deletions through SQL. A queue row whose file is
-- referenced again (itap.file_in_use: re-attached since it was queued) is dropped instead of deleted from storage.
-- Claimed rows are locked SKIP LOCKED and leased for 10 minutes, so two drains (daily retention run and the 10-minute
-- drain cron) never take the same file; due = never tried or the backoff (2^attempts minutes, at most 6 h) passed,
-- fewer than 10 attempts. A failure (backend) counts an attempt and clears the lease.
ALTER TABLE itap.pending_file_deletions ADD COLUMN lease_expires_at timestamptz;

CREATE FUNCTION itap.claim_file_deletions(p_limit integer DEFAULT 500)
RETURNS SETOF itap.pending_file_deletions
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  q itap.pending_file_deletions;
  claimed integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 5000 THEN
    PERFORM itap.raise_code('file_deletion_limit_invalid');
  END IF;
  FOR q IN
    SELECT * FROM itap.pending_file_deletions x
    WHERE x.attempts < 10 AND (x.lease_expires_at IS NULL OR x.lease_expires_at <= now())
      AND (x.attempts = 0 OR x.last_attempt_at IS NULL
           OR x.last_attempt_at + least(power(2, x.attempts) * interval '1 minute', interval '6 hours') <= now())
    ORDER BY x.last_attempt_at NULLS FIRST, x.enqueued_at, x.id
    FOR UPDATE SKIP LOCKED
  LOOP
    EXIT WHEN claimed >= p_limit;
    IF itap.file_in_use(q.organization_id, q.file_id) THEN
      DELETE FROM itap.pending_file_deletions x WHERE x.id = q.id;
      CONTINUE;
    END IF;
    UPDATE itap.pending_file_deletions x SET lease_expires_at = now() + interval '10 minutes'
    WHERE x.id = q.id RETURNING * INTO q;
    claimed := claimed + 1;
    RETURN NEXT q;
  END LOOP;
END;
$$;
