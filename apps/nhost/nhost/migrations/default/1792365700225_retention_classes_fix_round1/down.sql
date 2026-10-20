ALTER TABLE itap.retention_policies DROP CONSTRAINT retention_policies_retain_days;
ALTER TABLE itap.retention_policies ADD CONSTRAINT retention_policies_retain_days CHECK (retain_days BETWEEN 1 AND 36500);
DROP FUNCTION itap.retention_min_days(text);
CREATE OR REPLACE FUNCTION itap.retention_action_allowed(p_class text, p_action text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_action
    WHEN 'delete' THEN p_class IN (
      'detections', 'locations', 'sessions', 'events', 'deliveries', 'webhook_deliveries', 'incidents', 'photos',
      'embeddings_withdrawn', 'unknown_identities', 'auth_attempts', 'auth_evidence', 'search_history', 'bulk_jobs',
      'reports', 'access_decisions', 'terminal_syncs', 'stats', 'audit', 'trigger_logs')
    WHEN 'anonymize' THEN p_class IN (
      'detections', 'sessions', 'events', 'incidents', 'access_decisions', 'auth_attempts', 'unknown_identities', 'audit')
    WHEN 'archive' THEN p_class IN ('reports', 'bulk_jobs')
    ELSE false
  END;
$$;
INSERT INTO itap.retention_data_classes (value, description) VALUES ('trigger_logs', 'Hasura event and cron delivery logs');
