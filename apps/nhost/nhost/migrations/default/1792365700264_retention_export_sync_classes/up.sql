-- Retention classes export_jobs and integration_sync_runs (slice 10 task 4 fix round 1). Delete only, organization
-- wide (no facility dimension), minimum 1 day.
--   export_jobs: finished jobs (completed / failed) older than the cutoff by finished_at, with their files (file_id and
--     files tagged export_job_id); as a subject class (DSR erasure) the jobs whose recorded subject_ids name the
--     person; held when subject_ids name a held person. An organization-wide run also sweeps orphan export files
--     (tagged with a job that no longer exists).
--   integration_sync_runs: finished runs older than the cutoff (no personal data; never a subject class).
INSERT INTO itap.retention_data_classes (value, description) VALUES
  ('export_jobs', 'Finished export jobs and their files'),
  ('integration_sync_runs', 'Finished integration sync runs');

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
      'reports', 'access_decisions', 'terminal_syncs', 'stats', 'audit', 'export_jobs', 'integration_sync_runs')
    WHEN 'anonymize' THEN p_class IN (
      'detections', 'sessions', 'events', 'incidents', 'access_decisions', 'auth_attempts', 'unknown_identities', 'audit')
    WHEN 'archive' THEN p_class IN ('reports', 'bulk_jobs')
    ELSE false
  END;
$function$
;

CREATE OR REPLACE FUNCTION itap.retention_class_order(p_class text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT array_position(ARRAY[
    'access_decisions', 'auth_evidence', 'auth_attempts', 'deliveries', 'webhook_deliveries', 'reports', 'incidents',
    'events', 'detections', 'locations', 'sessions', 'search_history', 'bulk_jobs', 'export_jobs', 'integration_sync_runs', 'terminal_syncs', 'stats',
    'photos', 'embeddings_withdrawn', 'unknown_identities', 'audit'], p_class);
$function$
;

CREATE FUNCTION itap.retention_candidates_export_jobs(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT j.id, j.subject_ids && (coalesce((s).held_identities, '{}') || coalesce((s).held_profiles, '{}'))
  FROM itap.export_jobs j
  WHERE j.organization_id = (s).organization_id AND j.status IN ('completed', 'failed')
    AND coalesce(j.finished_at, j.updated_at) < (s).cutoff
    AND ((s).subject_identities IS NULL
         OR j.subject_ids && (coalesce((s).subject_identities, '{}') || coalesce((s).subject_profiles, '{}')));
$$;

CREATE FUNCTION itap.purge_export_jobs(p_org uuid, p_cutoff timestamptz, p_facility uuid, p_subject_profile uuid,
  p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('export_jobs', p_org, p_cutoff, p_facility, p_subject_profile,
    p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  v_files uuid[];
  n integer;
  v_orphans integer := 0;
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  v_files := ARRAY(SELECT j.file_id FROM itap.export_jobs j WHERE j.organization_id = p_org AND j.id = ANY (v_ids)
                     AND j.file_id IS NOT NULL) || itap.tagged_files(p_org, 'export_job_id', v_ids);
  DELETE FROM itap.export_jobs j WHERE j.organization_id = p_org AND j.id = ANY (v_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF p_facility IS NULL AND p_subject_profile IS NULL AND p_subject_identity IS NULL THEN
    v_orphans := itap.enqueue_unused_files(p_org, ARRAY(
      SELECT f.id FROM storage.files f
      WHERE f.bucket_id = p_org::text AND f.metadata ? 'export_job_id' AND f.created_at < p_cutoff
        AND NOT EXISTS (SELECT 1 FROM itap.export_jobs j WHERE j.organization_id = p_org AND j.id::text = f.metadata ->> 'export_job_id')
        AND NOT EXISTS (SELECT 1 FROM itap.pending_file_deletions q WHERE q.file_id = f.id)
      LIMIT p_limit), 'retention:export_jobs_orphan');
  END IF;
  RETURN QUERY SELECT n + v_orphans, v_held, itap.enqueue_unused_files(p_org, v_files, 'retention:export_jobs') + v_orphans;
  PERFORM itap.retention_end(prev);
END;
$$;

CREATE FUNCTION itap.retention_candidates_integration_sync_runs(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT r.id, false
  FROM itap.integration_sync_runs r
  WHERE r.organization_id = (s).organization_id AND r.status IN ('succeeded', 'failed')
    AND coalesce(r.finished_at, r.updated_at) < (s).cutoff AND (s).subject_identities IS NULL;
$$;

CREATE FUNCTION itap.purge_integration_sync_runs(p_org uuid, p_cutoff timestamptz, p_facility uuid, p_subject_profile uuid,
  p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('integration_sync_runs', p_org, p_cutoff, p_facility, p_subject_profile,
    p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  n integer;
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  DELETE FROM itap.integration_sync_runs r WHERE r.organization_id = p_org AND r.id = ANY (v_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN QUERY SELECT n, v_held, 0;
  PERFORM itap.retention_end(prev);
END;
$$;
