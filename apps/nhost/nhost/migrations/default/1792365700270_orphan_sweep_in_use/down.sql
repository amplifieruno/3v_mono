-- Restores the orphan sweeps without the in-use filter and export_jobs counting orphans in affected.
CREATE OR REPLACE FUNCTION itap.purge_reports(p_org uuid, p_cutoff timestamp with time zone, p_facility uuid, p_subject_profile uuid, p_subject_identity uuid, p_limit integer, p_action text)
 RETURNS TABLE(affected integer, skipped_by_hold integer, files_enqueued integer)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('reports', p_org, p_cutoff, p_facility, p_subject_profile,
    p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  v_files uuid[];
  n integer;
  v_orphans integer := 0;
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  v_files := ARRAY(SELECT r.file_id FROM itap.reports r WHERE r.organization_id = p_org AND r.id = ANY (v_ids)
                     AND r.file_id IS NOT NULL) || itap.tagged_files(p_org, 'report_id', v_ids);
  IF p_action = 'delete' THEN
    DELETE FROM itap.reports r WHERE r.organization_id = p_org AND r.id = ANY (v_ids);
    GET DIAGNOSTICS n = ROW_COUNT;
  ELSE
    DELETE FROM itap.report_metrics m WHERE m.organization_id = p_org AND m.report_id = ANY (v_ids);
    UPDATE itap.reports r SET status = 'expired', file_id = NULL
    WHERE r.organization_id = p_org AND r.id = ANY (v_ids);
    GET DIAGNOSTICS n = ROW_COUNT;
  END IF;
  IF p_facility IS NULL AND p_subject_profile IS NULL AND p_subject_identity IS NULL THEN
    -- Orphan files tagged with a report that no longer exists (failed attempts, missed sweeps).
    v_orphans := itap.enqueue_unused_files(p_org, ARRAY(
      SELECT f.id FROM storage.files f
      WHERE f.bucket_id = p_org::text AND f.metadata ? 'report_id' AND f.created_at < p_cutoff
        AND NOT EXISTS (SELECT 1 FROM itap.reports r WHERE r.organization_id = p_org AND r.id::text = f.metadata ->> 'report_id')
        AND NOT EXISTS (SELECT 1 FROM itap.pending_file_deletions q WHERE q.file_id = f.id)
      LIMIT p_limit), 'retention:reports_orphan');
  END IF;
  RETURN QUERY SELECT n + v_orphans, v_held, itap.enqueue_unused_files(p_org, v_files, 'retention:reports') + v_orphans;
  PERFORM itap.retention_end(prev);
END;
$function$
;

CREATE OR REPLACE FUNCTION itap.purge_bulk_jobs(p_org uuid, p_cutoff timestamp with time zone, p_facility uuid, p_subject_profile uuid, p_subject_identity uuid, p_limit integer, p_action text)
 RETURNS TABLE(affected integer, skipped_by_hold integer, files_enqueued integer)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('bulk_jobs', p_org, p_cutoff, p_facility, p_subject_profile,
    p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  v_files uuid[];
  n integer;
  v_orphans integer := 0;
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  v_files := ARRAY(
    SELECT j.input_file_id FROM itap.bulk_jobs j WHERE j.organization_id = p_org AND j.id = ANY (v_ids)
    UNION SELECT j.result_file_id FROM itap.bulk_jobs j WHERE j.organization_id = p_org AND j.id = ANY (v_ids)
    UNION SELECT q.image_file_id FROM itap.search_requests q WHERE q.organization_id = p_org AND q.bulk_job_id = ANY (v_ids)
  ) || itap.tagged_files(p_org, 'bulk_job_id', v_ids);
  DELETE FROM itap.search_requests q WHERE q.organization_id = p_org AND q.bulk_job_id = ANY (v_ids);
  IF p_action = 'delete' THEN
    DELETE FROM itap.bulk_jobs j WHERE j.organization_id = p_org AND j.id = ANY (v_ids);
    GET DIAGNOSTICS n = ROW_COUNT;
  ELSE
    DELETE FROM itap.bulk_job_rows r WHERE r.organization_id = p_org AND r.bulk_job_id = ANY (v_ids);
    UPDATE itap.bulk_jobs j SET input_file_id = NULL, result_file_id = NULL
    WHERE j.organization_id = p_org AND j.id = ANY (v_ids);
    GET DIAGNOSTICS n = ROW_COUNT;
  END IF;
  IF p_facility IS NULL AND p_subject_profile IS NULL AND p_subject_identity IS NULL THEN
    -- Orphan files tagged with a bulk job that no longer exists (failed attempts, missed sweeps).
    v_orphans := itap.enqueue_unused_files(p_org, ARRAY(
      SELECT f.id FROM storage.files f
      WHERE f.bucket_id = p_org::text AND f.metadata ? 'bulk_job_id' AND f.created_at < p_cutoff
        AND NOT EXISTS (SELECT 1 FROM itap.bulk_jobs r WHERE r.organization_id = p_org AND r.id::text = f.metadata ->> 'bulk_job_id')
        AND NOT EXISTS (SELECT 1 FROM itap.pending_file_deletions q WHERE q.file_id = f.id)
      LIMIT p_limit), 'retention:bulk_jobs_orphan');
  END IF;
  RETURN QUERY SELECT n + v_orphans, v_held, itap.enqueue_unused_files(p_org, v_files, 'retention:bulk_jobs') + v_orphans;
  PERFORM itap.retention_end(prev);
END;
$function$
;

CREATE OR REPLACE FUNCTION itap.purge_export_jobs(p_org uuid, p_cutoff timestamp with time zone, p_facility uuid, p_subject_profile uuid, p_subject_identity uuid, p_limit integer, p_action text)
 RETURNS TABLE(affected integer, skipped_by_hold integer, files_enqueued integer)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
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
$function$
;
