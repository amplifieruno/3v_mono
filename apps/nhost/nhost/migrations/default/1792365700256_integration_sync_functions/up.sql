-- Integration sync job functions (spec §8.4 run_sync, §8.5 run_integration_sync; slice 10 task 4). Lease / attempt
-- fencing as for reports (conventions "Analytics, Reports, Search, Bulk"):
--   request_integration_sync(org, integration, trigger, actor): the run (running, attempts 0); refuses a missing
--     integration (integration_not_found), a paused one (integration_paused) and a second running run
--     (integration_sync_running). An HR fixture is resolved here (config.fixture_file_id, a file of the organization
--     bucket of kind integration_fixture; otherwise the run has none and the job fails it with fixture_not_found).
--   claim_integration_sync(run): never claimed or lease expired -> attempts + 1, 10-minute lease; after
--     integration_sync_max_attempts() the run fails with max_attempts.
--   complete_integration_sync(run, attempt, result) / fail_integration_sync(run, attempt, error, result): fenced by the
--     attempt. Success: integration last_sync_at = the run's started_at (the next stub window starts there), last_error
--     cleared, status error -> active. Failure: run failed, integration status error (a paused integration stays
--     paused), last_error, and one integration_failed event (no secret, no config, no source values).
--   due_integration_syncs(at, limit): runs the trigger left unclaimed for over a minute or whose lease expired.
--   init_integration_schedule / run_integration_schedule: the run_integration_schedules cron (guarded by
--     next_sync_at = run time under a row lock; a running run skips the slot).

CREATE FUNCTION itap.integration_sync_max_attempts() RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT 3 $$;

-- Result counts of a run from the job's jsonb ({records_in, records_out, created, updated, deactivated, skipped,
-- errors}); missing keys are 0 / []; errors capped at 50 entries.
CREATE FUNCTION itap.integration_sync_count(p_result jsonb, p_key text) RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT greatest(coalesce(CASE WHEN jsonb_typeof(p_result -> p_key) = 'number' THEN (p_result ->> p_key)::numeric END, 0), 0)::integer;
$$;

CREATE FUNCTION itap.integration_sync_errors(p_result jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $$
  SELECT coalesce((SELECT jsonb_agg(e ORDER BY n) FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_result -> 'errors') = 'array' THEN p_result -> 'errors' ELSE '[]'::jsonb END)
    WITH ORDINALITY AS x(e, n) WHERE n <= 50), '[]'::jsonb);
$$;

CREATE FUNCTION itap.request_integration_sync(p_org uuid, p_integration uuid, p_trigger text, p_actor uuid)
RETURNS SETOF itap.integration_sync_runs
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  i itap.integrations;
  fixture uuid;
  r itap.integration_sync_runs;
BEGIN
  SELECT * INTO i FROM itap.integrations x WHERE x.organization_id = p_org AND x.id = p_integration FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('integration_not_found');
  END IF;
  IF i.status = 'paused' THEN
    PERFORM itap.raise_code('integration_paused');
  END IF;
  IF EXISTS (SELECT 1 FROM itap.integration_sync_runs x
             WHERE x.organization_id = p_org AND x.integration_id = i.id AND x.status = 'running') THEN
    PERFORM itap.raise_code('integration_sync_running');
  END IF;
  IF i.kind = 'hr' AND i.config ? 'fixture_file_id' THEN
    SELECT f.id INTO fixture FROM storage.files f
    WHERE f.id = (i.config ->> 'fixture_file_id')::uuid AND f.bucket_id = p_org::text
      AND f.metadata ->> 'kind' = 'integration_fixture';
  END IF;
  INSERT INTO itap.integration_sync_runs (organization_id, integration_id, trigger, fixture_file_id, requested_by)
  VALUES (p_org, i.id, p_trigger, fixture, p_actor)
  RETURNING * INTO r;
  RETURN NEXT r;
END;
$$;

-- Fails a locked running run and its integration (shared by fail_integration_sync and the max_attempts path).
CREATE FUNCTION itap.integration_sync_failed(r itap.integration_sync_runs, p_error text, p_result jsonb)
RETURNS itap.integration_sync_runs
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  msg text := left(coalesce(nullif(btrim(p_error), ''), 'unknown_error'), 1000);
  i itap.integrations;
  ev itap.events;
  ev_id uuid;
BEGIN
  UPDATE itap.integration_sync_runs
  SET status = 'failed', finished_at = now(), lease_expires_at = NULL, error = msg,
      records_in = itap.integration_sync_count(p_result, 'records_in'),
      records_out = itap.integration_sync_count(p_result, 'records_out'),
      created_count = itap.integration_sync_count(p_result, 'created'),
      updated_count = itap.integration_sync_count(p_result, 'updated'),
      deactivated_count = itap.integration_sync_count(p_result, 'deactivated'),
      skipped_count = itap.integration_sync_count(p_result, 'skipped'),
      errors = itap.integration_sync_errors(p_result)
  WHERE id = r.id
  RETURNING * INTO r;
  UPDATE itap.integrations
  SET status = CASE WHEN status = 'paused' THEN status ELSE 'error' END, last_error = msg
  WHERE organization_id = r.organization_id AND id = r.integration_id
  RETURNING * INTO i;
  ev.organization_id := r.organization_id;
  ev.event_type := 'integration_failed';
  ev.severity := 'high';
  ev.title := 'Integration sync failed: ' || i.code;
  -- Never the secret, the config or source values: identifiers and the error only.
  ev.payload := jsonb_build_object('integration_id', i.id, 'code', i.code, 'name', i.name, 'kind', i.kind,
    'run_id', r.id, 'trigger', r.trigger, 'error', msg);
  ev.dedup_key := 'integration_sync:' || r.id || ':failed';
  ev.occurred_at := now();
  ev_id := itap.emit_event(ev);
  IF ev_id IS NOT NULL THEN
    PERFORM itap.finish_events(r.organization_id, ARRAY[ev_id]);
  END IF;
  RETURN r;
END;
$$;

CREATE FUNCTION itap.claim_integration_sync(p_run uuid) RETURNS SETOF itap.integration_sync_runs
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  r itap.integration_sync_runs;
BEGIN
  SELECT * INTO r FROM itap.integration_sync_runs x
  WHERE x.id = p_run AND x.status = 'running' AND (x.attempts = 0 OR x.lease_expires_at <= now())
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF r.attempts >= itap.integration_sync_max_attempts() THEN
    PERFORM itap.integration_sync_failed(r, 'max_attempts', '{}'::jsonb);
    RETURN;
  END IF;
  UPDATE itap.integration_sync_runs
  SET attempts = attempts + 1, lease_expires_at = now() + interval '10 minutes'
  WHERE id = r.id
  RETURNING * INTO r;
  RETURN NEXT r;
END;
$$;

CREATE FUNCTION itap.complete_integration_sync(p_run uuid, p_attempt integer, p_result jsonb)
RETURNS SETOF itap.integration_sync_runs
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  r itap.integration_sync_runs;
BEGIN
  UPDATE itap.integration_sync_runs
  SET status = 'succeeded', finished_at = now(), lease_expires_at = NULL,
      records_in = itap.integration_sync_count(p_result, 'records_in'),
      records_out = itap.integration_sync_count(p_result, 'records_out'),
      created_count = itap.integration_sync_count(p_result, 'created'),
      updated_count = itap.integration_sync_count(p_result, 'updated'),
      deactivated_count = itap.integration_sync_count(p_result, 'deactivated'),
      skipped_count = itap.integration_sync_count(p_result, 'skipped'),
      errors = itap.integration_sync_errors(p_result)
  WHERE id = p_run AND status = 'running' AND attempts = p_attempt
  RETURNING * INTO r;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  UPDATE itap.integrations
  SET last_sync_at = r.started_at, last_error = NULL, status = CASE WHEN status = 'error' THEN 'active' ELSE status END
  WHERE organization_id = r.organization_id AND id = r.integration_id;
  RETURN NEXT r;
END;
$$;

CREATE FUNCTION itap.fail_integration_sync(p_run uuid, p_attempt integer, p_error text, p_result jsonb DEFAULT '{}'::jsonb)
RETURNS SETOF itap.integration_sync_runs
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  r itap.integration_sync_runs;
BEGIN
  SELECT * INTO r FROM itap.integration_sync_runs x
  WHERE x.id = p_run AND x.status = 'running' AND x.attempts = p_attempt
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  RETURN NEXT itap.integration_sync_failed(r, p_error, coalesce(p_result, '{}'::jsonb));
END;
$$;

CREATE FUNCTION itap.due_integration_syncs(p_at timestamptz, p_limit integer) RETURNS SETOF itap.integration_sync_runs
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT * FROM itap.integration_sync_runs r
  WHERE r.status = 'running'
    AND ((r.attempts = 0 AND r.updated_at <= p_at - interval '60 seconds') OR r.lease_expires_at <= p_at)
  ORDER BY r.updated_at, r.id
  LIMIT greatest(p_limit, 0);
$$;

CREATE FUNCTION itap.init_integration_schedule(p_integration uuid, p_next timestamptz) RETURNS SETOF itap.integrations
LANGUAGE sql
SET search_path = pg_catalog, itap
AS $$
  UPDATE itap.integrations SET next_sync_at = p_next
  WHERE id = p_integration AND next_sync_at IS NULL AND config ? 'schedule_cron' AND status <> 'paused'
  RETURNING *;
$$;

CREATE FUNCTION itap.run_integration_schedule(p_integration uuid, p_run_at timestamptz, p_next timestamptz)
RETURNS SETOF itap.integration_sync_runs
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  i itap.integrations;
BEGIN
  SELECT * INTO i FROM itap.integrations x WHERE x.id = p_integration FOR UPDATE;
  IF NOT FOUND OR i.status = 'paused' OR NOT i.config ? 'schedule_cron' OR i.next_sync_at IS DISTINCT FROM p_run_at THEN
    RETURN;
  END IF;
  UPDATE itap.integrations SET next_sync_at = p_next WHERE id = i.id;
  IF EXISTS (SELECT 1 FROM itap.integration_sync_runs x
             WHERE x.organization_id = i.organization_id AND x.integration_id = i.id AND x.status = 'running') THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM itap.request_integration_sync(i.organization_id, i.id, 'schedule', NULL);
END;
$$;
