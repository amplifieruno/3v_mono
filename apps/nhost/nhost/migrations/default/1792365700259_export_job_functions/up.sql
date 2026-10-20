-- Export job functions (spec §8.3 run_export_definitions, §8.4 run_export; slice 10 task 4). Lease / attempt fencing
-- as for reports:
--   claim_export_job(job): queued, or running with an expired lease -> running, attempts + 1, 10-minute lease;
--     export_max_attempts() reached -> failed max_attempts; the requester no longer an active member (or no longer the
--     definition owner) -> failed requester_not_member.
--   complete_export_job(job, attempt, file, row_count, truncated, watermark): the file must be the requester's own
--     `export` file in the organization bucket; an incremental definition's watermark advances (never backwards) only
--     when it still is the job's starting point (an edit resetting the definition in between wins); audit `export`.
--   fail_export_job(job, attempt, error): failed (the watermark never moves).
--   due_export_jobs(at, limit): queued for over a minute (the trigger missed them) or lease expired.
--   init_export_definition / run_export_definition / record_export_definition_failure: the run_export_definitions
--     cron (guarded by next_run_at = run time under a row lock; requested_by = the owner, who must be an active
--     member — otherwise last_error owner_not_member; a slot whose previous job is still open is skipped).

CREATE FUNCTION itap.export_max_attempts() RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT 3 $$;

CREATE FUNCTION itap.claim_export_job(p_job uuid) RETURNS SETOF itap.export_jobs
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  j itap.export_jobs;
BEGIN
  SELECT * INTO j FROM itap.export_jobs x
  WHERE x.id = p_job AND (x.status = 'queued' OR (x.status = 'running' AND x.lease_expires_at <= now()))
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF j.attempts >= itap.export_max_attempts() THEN
    UPDATE itap.export_jobs SET status = 'failed', error = 'max_attempts', finished_at = now(), lease_expires_at = NULL
    WHERE id = j.id;
    RETURN;
  END IF;
  IF NOT itap.member_active(j.organization_id, j.requested_by)
     OR NOT EXISTS (SELECT 1 FROM itap.export_definitions d WHERE d.organization_id = j.organization_id
                    AND d.id = j.definition_id AND d.owner_id = j.requested_by) THEN
    UPDATE itap.export_jobs SET status = 'failed', error = 'requester_not_member', finished_at = now(), lease_expires_at = NULL
    WHERE id = j.id;
    RETURN;
  END IF;
  UPDATE itap.export_jobs
  SET status = 'running', attempts = attempts + 1, lease_expires_at = now() + interval '10 minutes',
      started_at = coalesce(started_at, now()), error = NULL
  WHERE id = j.id
  RETURNING * INTO j;
  RETURN NEXT j;
END;
$$;

CREATE FUNCTION itap.complete_export_job(
  p_job uuid, p_attempt integer, p_file uuid, p_row_count integer, p_truncated boolean, p_watermark timestamptz
) RETURNS SETOF itap.export_jobs
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  j itap.export_jobs;
BEGIN
  SELECT * INTO j FROM itap.export_jobs x WHERE x.id = p_job AND x.status = 'running' AND x.attempts = p_attempt FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.files f WHERE f.id = p_file AND f.bucket_id = j.organization_id::text
                 AND f.metadata ->> 'kind' = 'export' AND f.uploaded_by_user_id = j.requested_by) THEN
    PERFORM itap.raise_code('export_file_invalid');
  END IF;
  UPDATE itap.export_jobs
  SET status = 'completed', file_id = p_file, row_count = greatest(coalesce(p_row_count, 0), 0),
      truncated = coalesce(p_truncated, false), finished_at = now(), lease_expires_at = NULL,
      watermark_to = CASE WHEN j.mode = 'incremental' THEN greatest(j.watermark_from, p_watermark) END
  WHERE id = j.id
  RETURNING * INTO j;
  IF j.mode = 'incremental' AND p_watermark IS NOT NULL THEN
    UPDATE itap.export_definitions d
    SET watermark = greatest(d.watermark, p_watermark)
    WHERE d.organization_id = j.organization_id AND d.id = j.definition_id AND d.mode = 'incremental'
      AND d.entity = j.entity AND d.filters = j.filters AND d.watermark IS NOT DISTINCT FROM j.watermark_from;
  END IF;
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes)
  VALUES (j.organization_id, j.requested_by, 'export', 'export_jobs', j.id,
          jsonb_build_object('definition_id', j.definition_id, 'entity', j.entity, 'format', j.format, 'mode', j.mode,
                             'row_count', j.row_count, 'truncated', j.truncated, 'file_id', j.file_id));
  RETURN NEXT j;
END;
$$;

CREATE FUNCTION itap.fail_export_job(p_job uuid, p_attempt integer, p_error text) RETURNS SETOF itap.export_jobs
LANGUAGE sql
SET search_path = pg_catalog, itap
AS $$
  UPDATE itap.export_jobs
  SET status = 'failed', finished_at = now(), lease_expires_at = NULL,
      error = left(coalesce(nullif(btrim(p_error), ''), 'unknown_error'), 1000)
  WHERE id = p_job AND status = 'running' AND attempts = p_attempt
  RETURNING *;
$$;

CREATE FUNCTION itap.due_export_jobs(p_at timestamptz, p_limit integer) RETURNS SETOF itap.export_jobs
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT * FROM itap.export_jobs j
  WHERE (j.status = 'queued' AND j.updated_at <= p_at - interval '60 seconds')
     OR (j.status = 'running' AND j.lease_expires_at <= p_at)
  ORDER BY j.updated_at, j.id
  LIMIT greatest(p_limit, 0);
$$;

CREATE FUNCTION itap.init_export_definition(p_definition uuid, p_next timestamptz) RETURNS SETOF itap.export_definitions
LANGUAGE sql
SET search_path = pg_catalog, itap
AS $$
  UPDATE itap.export_definitions SET next_run_at = p_next, last_error = NULL, last_failed_at = NULL
  WHERE id = p_definition AND is_active AND schedule_cron IS NOT NULL AND next_run_at IS NULL
  RETURNING *;
$$;

CREATE FUNCTION itap.run_export_definition(p_definition uuid, p_run_at timestamptz, p_next timestamptz)
RETURNS SETOF itap.export_jobs
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  d itap.export_definitions;
  j itap.export_jobs;
BEGIN
  SELECT * INTO d FROM itap.export_definitions x WHERE x.id = p_definition FOR UPDATE;
  IF NOT FOUND OR NOT d.is_active OR d.schedule_cron IS NULL OR d.next_run_at IS DISTINCT FROM p_run_at THEN
    RETURN;
  END IF;
  IF NOT itap.member_active(d.organization_id, d.owner_id) THEN
    UPDATE itap.export_definitions
    SET last_run_at = p_run_at, next_run_at = p_next, last_error = 'owner_not_member', last_failed_at = p_run_at
    WHERE id = d.id;
    RETURN;
  END IF;
  UPDATE itap.export_definitions SET last_run_at = p_run_at, next_run_at = p_next, last_error = NULL, last_failed_at = NULL
  WHERE id = d.id;
  IF EXISTS (SELECT 1 FROM itap.export_jobs x WHERE x.organization_id = d.organization_id AND x.definition_id = d.id
             AND x.status IN ('queued', 'running')) THEN
    RETURN;
  END IF;
  INSERT INTO itap.export_jobs (organization_id, definition_id, trigger, scheduled_for, requested_by,
                                entity, format, mode)
  VALUES (d.organization_id, d.id, 'schedule', p_run_at, d.owner_id, d.entity, d.format, d.mode)
  RETURNING * INTO j;
  RETURN NEXT j;
END;
$$;

CREATE FUNCTION itap.record_export_definition_failure(p_definition uuid, p_run_at timestamptz, p_next timestamptz, p_error text)
RETURNS SETOF itap.export_definitions
LANGUAGE sql
SET search_path = pg_catalog, itap
AS $$
  UPDATE itap.export_definitions
  SET next_run_at = p_next, last_run_at = coalesce(p_run_at, last_run_at),
      last_error = left(coalesce(nullif(btrim(p_error), ''), 'unknown_error'), 1000),
      last_failed_at = coalesce(p_run_at, now())
  WHERE id = p_definition
  RETURNING *;
$$;
