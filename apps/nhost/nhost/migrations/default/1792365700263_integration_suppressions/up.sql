-- Integrations fix round 1 (slice 10 task 4):
-- * integration_suppressions: people erased by a DSR must never come back through an HR sync. The erasure records a
--   suppression key = sha256("<integration id>:<external id>") (itap.integration_suppression_key) — the identifier
--   itself is not kept (the tombstone loses source_integration_id / external_id as before, so the DSR scan finds no
--   identifier); the HR sync hashes each record's key the same way and skips matches (skipped_suppressed). A key of a
--   low-entropy external id is pseudonymous, not anonymous: kept as the minimum needed to honour the erasure
--   (suppression list). Backend-only table (no permissions), removed with its integration.
-- * Run counts skipped_suppressed and skipped_restricted (profiles under restriction of processing are neither
--   updated nor deactivated by a sync, Art. 18).
-- * renew_integration_sync_lease(run, attempt): the job extends its 10-minute lease while it works (every 100 records).
CREATE TABLE itap.integration_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  key_hash text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_suppressions_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT integration_suppressions_key UNIQUE (organization_id, integration_id, key_hash),
  CONSTRAINT integration_suppressions_hash CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT integration_suppressions_integration_fkey FOREIGN KEY (organization_id, integration_id)
    REFERENCES itap.integrations (organization_id, id) ON DELETE CASCADE
);

CREATE FUNCTION itap.integration_suppression_key(p_integration uuid, p_external_id text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$ SELECT encode(sha256(convert_to(lower(p_integration::text) || ':' || p_external_id, 'UTF8')), 'hex') $$;

ALTER TABLE itap.integration_sync_runs
  ADD COLUMN skipped_suppressed integer NOT NULL DEFAULT 0,
  ADD COLUMN skipped_restricted integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT integration_sync_runs_skips CHECK (skipped_suppressed >= 0 AND skipped_restricted >= 0);

CREATE OR REPLACE FUNCTION itap.complete_integration_sync(p_run uuid, p_attempt integer, p_result jsonb)
 RETURNS SETOF itap.integration_sync_runs
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
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
      skipped_suppressed = itap.integration_sync_count(p_result, 'skipped_suppressed'),
      skipped_restricted = itap.integration_sync_count(p_result, 'skipped_restricted'),
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
$function$
;

CREATE OR REPLACE FUNCTION itap.integration_sync_failed(r itap.integration_sync_runs, p_error text, p_result jsonb)
 RETURNS itap.integration_sync_runs
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
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
      skipped_suppressed = itap.integration_sync_count(p_result, 'skipped_suppressed'),
      skipped_restricted = itap.integration_sync_count(p_result, 'skipped_restricted'),
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
$function$
;

CREATE FUNCTION itap.renew_integration_sync_lease(p_run uuid, p_attempt integer) RETURNS SETOF itap.integration_sync_runs
LANGUAGE sql
SET search_path = pg_catalog, itap
AS $$
  UPDATE itap.integration_sync_runs SET lease_expires_at = now() + interval '10 minutes'
  WHERE id = p_run AND status = 'running' AND attempts = p_attempt
  RETURNING *;
$$;
