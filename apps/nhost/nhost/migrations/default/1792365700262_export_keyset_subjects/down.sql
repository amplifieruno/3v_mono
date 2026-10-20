DROP FUNCTION itap.complete_export_job(uuid, integer, uuid, integer, boolean, timestamptz, uuid, uuid[]);

CREATE OR REPLACE FUNCTION itap.complete_export_job(p_job uuid, p_attempt integer, p_file uuid, p_row_count integer, p_truncated boolean, p_watermark timestamp with time zone)
 RETURNS SETOF itap.export_jobs
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
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
$function$
;

DROP FUNCTION itap.export_subject_ids(uuid, text, uuid[]);

CREATE OR REPLACE FUNCTION itap.export_jobs_prepare()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  d itap.export_definitions;
BEGIN
  SELECT * INTO d FROM itap.export_definitions x WHERE x.organization_id = NEW.organization_id AND x.id = NEW.definition_id;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('export_definition_not_found');
  END IF;
  IF NEW.requested_by IS DISTINCT FROM d.owner_id THEN
    PERFORM itap.raise_code('export_owner_only');
  END IF;
  IF NOT itap.member_active(NEW.organization_id, NEW.requested_by) THEN
    PERFORM itap.raise_code('member_not_active:requested_by');
  END IF;
  IF EXISTS (SELECT 1 FROM itap.export_jobs j WHERE j.organization_id = NEW.organization_id
             AND j.definition_id = NEW.definition_id AND j.status IN ('queued', 'running')) THEN
    PERFORM itap.raise_code('export_job_active');
  END IF;
  NEW.status := 'queued';
  NEW.entity := d.entity;
  NEW.format := d.format;
  NEW.mode := d.mode;
  NEW.filters := d.filters;
  NEW.watermark_from := CASE WHEN d.mode = 'incremental' THEN d.watermark END;
  NEW.watermark_to := NULL;
  NEW.file_id := NULL;
  NEW.row_count := NULL;
  NEW.truncated := false;
  NEW.attempts := 0;
  NEW.lease_expires_at := NULL;
  NEW.started_at := NULL;
  NEW.finished_at := NULL;
  NEW.error := NULL;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION itap.export_definitions_prepare()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      PERFORM itap.raise_code('export_owner_immutable');
    END IF;
    IF (NEW.entity, NEW.filters, NEW.mode) IS DISTINCT FROM (OLD.entity, OLD.filters, OLD.mode) THEN
      NEW.watermark := NULL;
    END IF;
    IF (NEW.schedule_cron, NEW.timezone, NEW.is_active) IS DISTINCT FROM (OLD.schedule_cron, OLD.timezone, OLD.is_active) THEN
      NEW.next_run_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION itap.member_active(p_org uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
  SELECT EXISTS (SELECT 1 FROM itap.organization_members m
                 WHERE m.organization_id = p_org AND m.user_id = p_user AND m.status = 'active'
                   AND (m.expires_at IS NULL OR m.expires_at > now()));
$function$
;

DROP TRIGGER audit ON itap.export_definitions;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.export_definitions
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change(
    'ignore:watermark', 'ignore:next_run_at', 'ignore:last_run_at', 'ignore:last_error', 'ignore:last_failed_at');
DROP INDEX itap.export_jobs_subject_ids_idx;
ALTER TABLE itap.export_jobs DROP COLUMN watermark_from_id, DROP COLUMN watermark_to_id, DROP COLUMN max_rows, DROP COLUMN subject_ids;
ALTER TABLE itap.export_definitions DROP COLUMN watermark_id, DROP COLUMN max_rows;
