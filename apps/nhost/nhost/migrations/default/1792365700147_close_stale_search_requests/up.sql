-- Slice 7 final review: search requests stuck queued / running (the worker died mid-search, outside a bulk job too)
-- are closed as failed 'interrupted' after 10 minutes. Called every minute by the resume_bulk_jobs cron.
-- Open requests are few; the sweep reads only them.
CREATE INDEX search_requests_open_idx ON itap.search_requests (created_at) WHERE status IN ('queued', 'running');

CREATE FUNCTION itap.close_stale_search_requests(p_at timestamptz) RETURNS SETOF itap.search_requests
LANGUAGE sql VOLATILE
SET search_path = pg_catalog, itap
AS $$
  UPDATE itap.search_requests s
  SET status = 'failed', error = 'interrupted', completed_at = p_at
  WHERE s.id IN (
    SELECT x.id FROM itap.search_requests x
    WHERE x.status IN ('queued', 'running') AND coalesce(x.started_at, x.created_at) < p_at - interval '10 minutes'
    ORDER BY x.id
    FOR UPDATE SKIP LOCKED
  )
  RETURNING s.*;
$$;
