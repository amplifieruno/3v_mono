-- Slice 10 task 1 fix round 1: trigger_logs is not organization data (Hasura's delivery logs are purged platform-wide
-- by the purge_trigger_logs cron), so it leaves the org-scoped retention classes; audit and auth_attempts keep a
-- floor of 365 days (itap.retention_min_days, CHECK retention_policies_retain_days).
DELETE FROM itap.retention_run_classes WHERE data_class = 'trigger_logs';
DELETE FROM itap.processing_activity_data_classes WHERE data_class = 'trigger_logs';
DELETE FROM itap.retention_policies WHERE data_class = 'trigger_logs';
DELETE FROM itap.retention_data_classes WHERE value = 'trigger_logs';

CREATE OR REPLACE FUNCTION itap.retention_action_allowed(p_class text, p_action text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
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
$$;

-- Minimum retain_days per class (evidentiary logs: one year).
CREATE FUNCTION itap.retention_min_days(p_class text) RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE WHEN p_class IN ('audit', 'auth_attempts') THEN 365 ELSE 1 END;
$$;

ALTER TABLE itap.retention_policies DROP CONSTRAINT retention_policies_retain_days;
ALTER TABLE itap.retention_policies ADD CONSTRAINT retention_policies_retain_days
  CHECK (retain_days BETWEEN itap.retention_min_days(data_class) AND 36500);
