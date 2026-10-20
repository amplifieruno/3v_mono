DROP FUNCTION itap.purge_integration_sync_runs(uuid, timestamptz, uuid, uuid, uuid, integer, text);
DROP FUNCTION itap.retention_candidates_integration_sync_runs(itap.retention_scope);
DROP FUNCTION itap.purge_export_jobs(uuid, timestamptz, uuid, uuid, uuid, integer, text);
DROP FUNCTION itap.retention_candidates_export_jobs(itap.retention_scope);
CREATE OR REPLACE FUNCTION itap.retention_class_order(p_class text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT array_position(ARRAY[
    'access_decisions', 'auth_evidence', 'auth_attempts', 'deliveries', 'webhook_deliveries', 'reports', 'incidents',
    'events', 'detections', 'locations', 'sessions', 'search_history', 'bulk_jobs', 'terminal_syncs', 'stats',
    'photos', 'embeddings_withdrawn', 'unknown_identities', 'audit'], p_class);
$function$
;
CREATE OR REPLACE FUNCTION itap.retention_action_allowed(p_class text, p_action text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT CASE p_action
    WHEN 'delete' THEN p_class IN (
      'detections', 'locations', 'sessions', 'events', 'deliveries', 'webhook_deliveries', 'incidents', 'photos',
      'embeddings_withdrawn', 'unknown_identities', 'auth_attempts', 'auth_evidence', 'search_history', 'bulk_jobs',
      'reports', 'access_decisions', 'terminal_syncs', 'stats', 'audit')
    WHEN 'anonymize' THEN p_class IN (
      'detections', 'sessions', 'events', 'incidents', 'access_decisions', 'auth_attempts', 'unknown_identities', 'audit')
    WHEN 'archive' THEN p_class IN ('reports', 'bulk_jobs')
    ELSE false
  END;
$function$
;
DELETE FROM itap.retention_run_classes WHERE data_class IN ('export_jobs', 'integration_sync_runs');
DELETE FROM itap.retention_policies WHERE data_class IN ('export_jobs', 'integration_sync_runs');
DELETE FROM itap.processing_activity_data_classes WHERE data_class IN ('export_jobs', 'integration_sync_runs');
DELETE FROM itap.retention_data_classes WHERE value IN ('export_jobs', 'integration_sync_runs');
