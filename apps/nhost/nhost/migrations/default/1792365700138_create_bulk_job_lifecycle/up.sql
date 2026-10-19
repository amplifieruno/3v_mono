-- Bulk job lifecycle (spec §8.4 run_bulk_job; slice 7 task 4). Backend-only functions (admin secret; roles []):
--   claim_bulk_job(job)                       queued, or running with an expired lease -> running, attempts + 1,
--                                             lease 2 minutes; out of attempts (3 since the last retry) -> failed
--                                             'max_attempts'; owner no longer an active member -> failed
--                                             'owner_inactive'. Returns the claimed job (nothing when not claimed).
--   bulk_job_progress(job, attempt, total, processed)
--                                             the claimed attempt only: total / processed (the resume point),
--                                             counters + errors from bulk_job_rows, lease extended; owner inactive ->
--                                             failed 'owner_inactive'. Always returns the job row: a status other than
--                                             running or another attempt tells the worker to stop (cancelled,
--                                             reclaimed, failed).
--   record_bulk_job_row(job, attempt, row_no, outcome, error, label, search_request)
--                                             a row outcome decided by the backend: failed / skipped (outcome +
--                                             error), or a bulk_search row from its search request (matched with the
--                                             top identity / no_match / failed with the request error).
--   complete_bulk_job(job, attempt, result_file)
--                                             the claimed attempt only: completed (no failed row) | partial | failed
--                                             ('all_rows_failed'); a bulk_search result file becomes the owner's.
--   fail_bulk_job(job, attempt, error)        the claimed attempt only -> failed with the error.
--   due_bulk_jobs(at, limit)                  queued jobs the trigger left for over a minute, expired leases.
-- org_admin mutations (a bulk_search job only by its owner): retry_bulk_job(job) failed | partial | cancelled ->
-- queued (processed 0, attempts budget renewed; rows with a successful outcome are kept and not applied again),
-- cancel_bulk_job(job) queued | running -> cancelled (the worker stops at its next row / progress update).
-- Counters: succeeded = created / updated / validated / matched / no_match rows, failed, skipped (blank records);
-- errors = the first 500 failed rows [{row_no, error}] in row order.

-- Owner of a job may act: an active, unexpired member whose account is not disabled.
CREATE FUNCTION itap.bulk_owner_active(p_org uuid, p_user uuid) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT EXISTS (
    SELECT 1 FROM itap.organization_members m JOIN auth.users u ON u.id = m.user_id
    WHERE m.organization_id = p_org AND m.user_id = p_user AND m.status = 'active'
      AND (m.expires_at IS NULL OR m.expires_at > now()) AND NOT u.disabled);
$$;

CREATE FUNCTION itap.bulk_job_refresh_counts(p_org uuid, p_job uuid) RETURNS void
LANGUAGE sql VOLATILE
SET search_path = pg_catalog, itap
AS $$
  UPDATE itap.bulk_jobs b
  SET succeeded = c.succeeded, failed = c.failed, skipped = c.skipped, errors = c.errors
  FROM (
    SELECT count(*) FILTER (WHERE r.outcome IN ('created', 'updated', 'validated', 'matched', 'no_match'))::integer AS succeeded,
           count(*) FILTER (WHERE r.outcome = 'failed')::integer AS failed,
           count(*) FILTER (WHERE r.outcome = 'skipped')::integer AS skipped,
           coalesce((SELECT jsonb_agg(jsonb_build_object('row_no', e.row_no, 'error', e.error) ORDER BY e.row_no)
                     FROM (SELECT x.row_no, x.error FROM itap.bulk_job_rows x
                           WHERE x.organization_id = p_org AND x.bulk_job_id = p_job AND x.outcome = 'failed'
                           ORDER BY x.row_no LIMIT 500) e), '[]'::jsonb) AS errors
    FROM itap.bulk_job_rows r WHERE r.organization_id = p_org AND r.bulk_job_id = p_job
  ) c
  WHERE b.organization_id = p_org AND b.id = p_job;
$$;

-- Ends a job (locked by the caller) with a final status.
CREATE FUNCTION itap.bulk_job_finish(p_job uuid, p_status text, p_error text) RETURNS SETOF itap.bulk_jobs
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid;
BEGIN
  SELECT organization_id INTO org FROM itap.bulk_jobs WHERE id = p_job;
  PERFORM itap.bulk_job_refresh_counts(org, p_job);
  RETURN QUERY
  UPDATE itap.bulk_jobs
  SET status = p_status, error = left(nullif(btrim(p_error), ''), 1000), lease_expires_at = NULL, completed_at = now()
  WHERE organization_id = org AND id = p_job
  RETURNING *;
END;
$$;

CREATE FUNCTION itap.bulk_job_max_attempts() RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT 3 $$;

CREATE FUNCTION itap.claim_bulk_job(p_job uuid) RETURNS SETOF itap.bulk_jobs
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  j itap.bulk_jobs;
BEGIN
  SELECT * INTO j FROM itap.bulk_jobs x
  WHERE x.id = p_job AND (x.status = 'queued' OR (x.status = 'running' AND x.lease_expires_at <= now()))
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF NOT itap.bulk_owner_active(j.organization_id, j.owner_id) THEN
    PERFORM itap.bulk_job_finish(j.id, 'failed', 'owner_inactive');
    RETURN;
  END IF;
  IF j.attempts - j.attempts_at_retry >= itap.bulk_job_max_attempts() THEN
    PERFORM itap.bulk_job_finish(j.id, 'failed', 'max_attempts');
    RETURN;
  END IF;
  RETURN QUERY
  UPDATE itap.bulk_jobs
  SET status = 'running', attempts = attempts + 1, lease_expires_at = now() + interval '2 minutes',
      started_at = coalesce(started_at, now()), error = NULL, completed_at = NULL
  WHERE id = j.id
  RETURNING *;
END;
$$;

CREATE FUNCTION itap.bulk_job_progress(p_job uuid, p_attempt integer, p_total integer, p_processed integer)
RETURNS SETOF itap.bulk_jobs
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  j itap.bulk_jobs;
BEGIN
  SELECT * INTO j FROM itap.bulk_jobs WHERE id = p_job FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF j.status <> 'running' OR j.attempts <> p_attempt THEN
    RETURN NEXT j;
    RETURN;
  END IF;
  UPDATE itap.bulk_jobs
  SET total = coalesce(p_total, total), processed = coalesce(p_processed, processed)
  WHERE id = j.id;
  IF NOT itap.bulk_owner_active(j.organization_id, j.owner_id) THEN
    RETURN QUERY SELECT * FROM itap.bulk_job_finish(j.id, 'failed', 'owner_inactive');
    RETURN;
  END IF;
  PERFORM itap.bulk_job_refresh_counts(j.organization_id, j.id);
  RETURN QUERY
  UPDATE itap.bulk_jobs SET lease_expires_at = now() + interval '2 minutes' WHERE id = j.id RETURNING *;
END;
$$;

-- The job row for a row writer: the claimed attempt of a running job, shared-locked so a reclaim / cancel waits.
CREATE FUNCTION itap.bulk_job_for_row(p_org uuid, p_job uuid, p_attempt integer, p_row_no integer) RETURNS itap.bulk_jobs
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  j itap.bulk_jobs;
BEGIN
  SELECT * INTO j FROM itap.bulk_jobs WHERE id = p_job AND (p_org IS NULL OR organization_id = p_org) FOR SHARE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('bulk_job_not_found');
  END IF;
  IF j.status <> 'running' OR j.attempts <> p_attempt THEN
    PERFORM itap.raise_code('bulk_job_not_claimed');
  END IF;
  IF p_row_no IS NULL OR p_row_no < 1 OR p_row_no > coalesce(j.total, 0) THEN
    PERFORM itap.raise_code('bulk_job_row_invalid');
  END IF;
  RETURN j;
END;
$$;

-- Writes a row outcome; a successful outcome already recorded is never replaced (returned as is).
CREATE FUNCTION itap.bulk_job_put_row(r itap.bulk_job_rows) RETURNS SETOF itap.bulk_job_rows
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO itap.bulk_job_rows (organization_id, bulk_job_id, row_no, private_owner_id, outcome, profile_id,
                                  identity_id, search_request_id, entity_code, label, confidence, error)
  SELECT r.organization_id, r.bulk_job_id, r.row_no, CASE WHEN j.kind = 'bulk_search' THEN j.owner_id END, r.outcome,
         r.profile_id, r.identity_id, r.search_request_id, r.entity_code, r.label, r.confidence, left(r.error, 1000)
  FROM itap.bulk_jobs j WHERE j.organization_id = r.organization_id AND j.id = r.bulk_job_id
  ON CONFLICT (organization_id, bulk_job_id, row_no) DO UPDATE
  SET outcome = EXCLUDED.outcome, profile_id = EXCLUDED.profile_id, identity_id = EXCLUDED.identity_id,
      search_request_id = EXCLUDED.search_request_id, entity_code = EXCLUDED.entity_code, label = EXCLUDED.label,
      confidence = EXCLUDED.confidence, error = EXCLUDED.error
  WHERE itap.bulk_job_rows.outcome = 'failed'
  RETURNING *;
  IF NOT FOUND THEN
    RETURN QUERY SELECT * FROM itap.bulk_job_rows x
    WHERE x.organization_id = r.organization_id AND x.bulk_job_id = r.bulk_job_id AND x.row_no = r.row_no;
  END IF;
END;
$$;

CREATE FUNCTION itap.record_bulk_job_row(
  p_job uuid, p_attempt integer, p_row_no integer, p_outcome text, p_error text, p_label text, p_search_request uuid
) RETURNS SETOF itap.bulk_job_rows
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  j itap.bulk_jobs := itap.bulk_job_for_row(NULL, p_job, p_attempt, p_row_no);
  req itap.search_requests;
  r itap.bulk_job_rows;
BEGIN
  r.organization_id := j.organization_id;
  r.bulk_job_id := j.id;
  r.row_no := p_row_no;
  r.label := nullif(btrim(p_label), '');
  IF p_search_request IS NOT NULL THEN
    SELECT * INTO req FROM itap.search_requests s
    WHERE s.organization_id = j.organization_id AND s.id = p_search_request AND s.bulk_job_id = j.id
      AND s.bulk_job_row_no = p_row_no AND s.user_id = j.owner_id;
    IF NOT FOUND OR j.kind <> 'bulk_search' THEN
      PERFORM itap.raise_code('bulk_search_request_mismatch');
    END IF;
    r.search_request_id := req.id;
    IF req.status = 'completed' THEN
      r.outcome := CASE WHEN req.results_count > 0 THEN 'matched' ELSE 'no_match' END;
      SELECT x.identity_id, x.confidence, i.code INTO r.identity_id, r.confidence, r.entity_code
      FROM itap.search_results x
      LEFT JOIN itap.identities i ON i.organization_id = x.organization_id AND i.id = x.identity_id
      WHERE x.organization_id = j.organization_id AND x.search_request_id = req.id
      ORDER BY x.rank LIMIT 1;
    ELSE
      r.outcome := 'failed';
      r.error := coalesce(req.error, 'search_' || req.status);
    END IF;
  ELSIF p_outcome = 'skipped' THEN
    r.outcome := 'skipped';
  ELSIF p_outcome = 'failed' THEN
    r.outcome := 'failed';
    r.error := coalesce(nullif(btrim(p_error), ''), 'unknown_error');
  ELSE
    PERFORM itap.raise_code('bulk_job_row_outcome_invalid');
  END IF;
  RETURN QUERY SELECT * FROM itap.bulk_job_put_row(r);
END;
$$;

CREATE FUNCTION itap.complete_bulk_job(p_job uuid, p_attempt integer, p_result_file uuid) RETURNS SETOF itap.bulk_jobs
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  j itap.bulk_jobs;
BEGIN
  SELECT * INTO j FROM itap.bulk_jobs WHERE id = p_job FOR UPDATE;
  IF NOT FOUND OR j.status <> 'running' OR j.attempts <> p_attempt THEN
    RETURN;
  END IF;
  IF p_result_file IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM storage.files f WHERE f.id = p_result_file AND f.bucket_id = j.organization_id::text) THEN
    PERFORM itap.raise_code('file_not_in_org_bucket:result_file_id');
  END IF;
  IF j.kind = 'bulk_search' AND p_result_file IS NOT NULL THEN
    -- Owner-only kind bulk_search_result: the owner becomes the file's uploader.
    UPDATE storage.files SET uploaded_by_user_id = j.owner_id WHERE id = p_result_file;
  END IF;
  PERFORM itap.bulk_job_refresh_counts(j.organization_id, j.id);
  SELECT * INTO j FROM itap.bulk_jobs WHERE id = p_job;
  UPDATE itap.bulk_jobs SET result_file_id = p_result_file, processed = coalesce(total, processed) WHERE id = j.id;
  RETURN QUERY SELECT * FROM itap.bulk_job_finish(
    j.id,
    CASE WHEN j.failed = 0 THEN 'completed' WHEN j.succeeded > 0 THEN 'partial' ELSE 'failed' END,
    CASE WHEN j.failed > 0 AND j.succeeded = 0 THEN 'all_rows_failed' END);
END;
$$;

CREATE FUNCTION itap.fail_bulk_job(p_job uuid, p_attempt integer, p_error text) RETURNS SETOF itap.bulk_jobs
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  j itap.bulk_jobs;
BEGIN
  SELECT * INTO j FROM itap.bulk_jobs WHERE id = p_job FOR UPDATE;
  IF NOT FOUND OR j.status <> 'running' OR j.attempts <> p_attempt THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM itap.bulk_job_finish(j.id, 'failed', coalesce(nullif(btrim(p_error), ''), 'unknown_error'));
END;
$$;

CREATE FUNCTION itap.due_bulk_jobs(p_at timestamptz, p_limit integer) RETURNS SETOF itap.bulk_jobs
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT * FROM itap.bulk_jobs b
  WHERE b.status IN ('queued', 'running')
    AND ((b.status = 'queued' AND b.updated_at <= p_at - interval '60 seconds')
         OR (b.status = 'running' AND b.lease_expires_at <= p_at))
  ORDER BY b.updated_at, b.id
  LIMIT greatest(p_limit, 0);
$$;

-- A job the session user may manage: of the session organization; a bulk_search job only of its owner.
CREATE FUNCTION itap.bulk_job_of_session(hasura_session json, p_job uuid) RETURNS itap.bulk_jobs
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  caller uuid := itap.session_user_id(hasura_session);
  j itap.bulk_jobs;
BEGIN
  SELECT * INTO j FROM itap.bulk_jobs WHERE organization_id = org AND id = p_job FOR UPDATE;
  IF NOT FOUND OR (j.kind = 'bulk_search' AND j.owner_id IS DISTINCT FROM caller) THEN
    PERFORM itap.raise_code('bulk_job_not_found');
  END IF;
  RETURN j;
END;
$$;

CREATE FUNCTION itap.retry_bulk_job(hasura_session json, p_job uuid) RETURNS SETOF itap.bulk_jobs
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  j itap.bulk_jobs := itap.bulk_job_of_session(hasura_session, p_job);
BEGIN
  IF j.status NOT IN ('failed', 'partial', 'cancelled') THEN
    PERFORM itap.raise_code('bulk_job_not_retryable');
  END IF;
  IF j.input_file_id IS NULL THEN
    PERFORM itap.raise_code('bulk_input_missing');
  END IF;
  RETURN QUERY
  UPDATE itap.bulk_jobs
  SET status = 'queued', processed = 0, attempts_at_retry = attempts, error = NULL, lease_expires_at = NULL,
      completed_at = NULL
  WHERE id = j.id
  RETURNING *;
END;
$$;

CREATE FUNCTION itap.cancel_bulk_job(hasura_session json, p_job uuid) RETURNS SETOF itap.bulk_jobs
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  j itap.bulk_jobs := itap.bulk_job_of_session(hasura_session, p_job);
BEGIN
  IF j.status NOT IN ('queued', 'running') THEN
    PERFORM itap.raise_code('bulk_job_not_cancellable');
  END IF;
  RETURN QUERY SELECT * FROM itap.bulk_job_finish(j.id, 'cancelled', NULL);
END;
$$;
