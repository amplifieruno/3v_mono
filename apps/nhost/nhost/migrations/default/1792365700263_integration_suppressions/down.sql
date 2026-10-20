DROP FUNCTION itap.renew_integration_sync_lease(uuid, integer);
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
ALTER TABLE itap.integration_sync_runs DROP COLUMN skipped_suppressed, DROP COLUMN skipped_restricted;
DROP FUNCTION itap.integration_suppression_key(uuid, text);
DROP TABLE itap.integration_suppressions;
