-- Exports fix round 1 (slice 10 task 4):
-- * Keyset cursor: an incremental definition remembers (watermark, watermark_id) of the last exported row; the next
--   job starts strictly after that pair with the same predicate the job pages with, so rows sharing the watermark
--   are never lost on truncation or exported twice. Jobs snapshot watermark_from(_id) and record watermark_to(_id).
-- * max_rows (1..50000, default 50000) per definition, snapshotted on the job (rows per file).
-- * subject_ids: the profiles / identities the exported rows reference (recorded at completion from the exported
--   row ids, itap.export_subject_ids) so DSR erasure and legal holds find the files naming a person without
--   downloading them.
-- * member_active also requires an enabled user account and an active organization: a disabled requester or a
--   suspended organization fails the job (requester_not_member) and refuses new jobs / scheduled runs.
ALTER TABLE itap.export_definitions
  ADD COLUMN watermark_id uuid,
  ADD COLUMN max_rows integer,
  ADD CONSTRAINT export_definitions_max_rows CHECK (max_rows IS NULL OR max_rows BETWEEN 1 AND 50000);
ALTER TABLE itap.export_jobs
  ADD COLUMN watermark_from_id uuid,
  ADD COLUMN watermark_to_id uuid,
  ADD COLUMN max_rows integer NOT NULL DEFAULT 50000,
  ADD COLUMN subject_ids uuid[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT export_jobs_max_rows CHECK (max_rows BETWEEN 1 AND 50000);
CREATE INDEX export_jobs_subject_ids_idx ON itap.export_jobs USING gin (subject_ids);

DROP TRIGGER audit ON itap.export_definitions;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.export_definitions
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change(
    'ignore:watermark', 'ignore:watermark_id', 'ignore:next_run_at', 'ignore:last_run_at', 'ignore:last_error',
    'ignore:last_failed_at');

CREATE OR REPLACE FUNCTION itap.member_active(p_org uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
  SELECT EXISTS (SELECT 1 FROM itap.organization_members m
                 WHERE m.organization_id = p_org AND m.user_id = p_user AND m.status = 'active'
                   AND (m.expires_at IS NULL OR m.expires_at > now()))
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user AND NOT u.disabled)
    AND EXISTS (SELECT 1 FROM itap.organizations o WHERE o.id = p_org AND o.status = 'active');
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
      NEW.watermark_id := NULL;
    END IF;
    IF (NEW.schedule_cron, NEW.timezone, NEW.is_active) IS DISTINCT FROM (OLD.schedule_cron, OLD.timezone, OLD.is_active) THEN
      NEW.next_run_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

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
  NEW.watermark_from_id := CASE WHEN d.mode = 'incremental' THEN d.watermark_id END;
  NEW.watermark_to := NULL;
  NEW.watermark_to_id := NULL;
  NEW.max_rows := coalesce(d.max_rows, 50000);
  NEW.subject_ids := '{}';
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

-- Profiles / identities referenced by exported rows of an entity (ids of the rows as exported).
CREATE FUNCTION itap.export_subject_ids(p_org uuid, p_entity text, p_rows uuid[]) RETURNS uuid[]
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT coalesce(array_agg(DISTINCT x) FILTER (WHERE x IS NOT NULL), '{}') FROM (
    SELECT p.id AS x FROM itap.profiles p WHERE p_entity = 'profiles' AND p.organization_id = p_org AND p.id = ANY (p_rows)
    UNION ALL SELECT i.id FROM itap.identities i WHERE p_entity = 'identities' AND i.organization_id = p_org AND i.id = ANY (p_rows)
    UNION ALL SELECT i.profile_id FROM itap.identities i WHERE p_entity = 'identities' AND i.organization_id = p_org AND i.id = ANY (p_rows)
    UNION ALL SELECT unnest(ARRAY[e.identity_id, e.profile_id, (e.payload ->> 'claimed_identity_id')::uuid,
                                  (e.payload ->> 'matched_identity_id')::uuid])
      FROM itap.events e WHERE p_entity = 'events' AND e.organization_id = p_org AND e.id = ANY (p_rows)
    UNION ALL SELECT unnest(ARRAY[ii.identity_id, i.profile_id])
      FROM itap.incident_identities ii LEFT JOIN itap.identities i ON i.organization_id = ii.organization_id AND i.id = ii.identity_id
      WHERE p_entity = 'incidents' AND ii.organization_id = p_org AND ii.incident_id = ANY (p_rows)
    UNION ALL SELECT unnest(ARRAY[v.visitor_profile_id, v.host_profile_id])
      FROM itap.visits v WHERE p_entity = 'visits' AND v.organization_id = p_org AND v.id = ANY (p_rows)
    UNION ALL SELECT unnest(ARRAY[a.identity_id, a.profile_id])
      FROM itap.access_decisions a WHERE p_entity = 'access_decisions' AND a.organization_id = p_org AND a.id = ANY (p_rows)
    UNION ALL SELECT d.identity_id FROM itap.detections d WHERE p_entity = 'detections' AND d.organization_id = p_org AND d.id = ANY (p_rows)
    UNION ALL SELECT unnest(ARRAY[t.claimed_identity_id, t.matched_identity_id, t.profile_id])
      FROM itap.authentication_attempts t WHERE p_entity = 'authentication_attempts' AND t.organization_id = p_org AND t.id = ANY (p_rows)
    UNION ALL SELECT a.entity_id FROM itap.audit_log a
      WHERE p_entity = 'audit_log' AND a.organization_id = p_org AND a.id = ANY (p_rows) AND a.entity IN ('profiles', 'identities')
  ) s;
$$;

DROP FUNCTION itap.complete_export_job(uuid, integer, uuid, integer, boolean, timestamptz);
CREATE FUNCTION itap.complete_export_job(
  p_job uuid, p_attempt integer, p_file uuid, p_row_count integer, p_truncated boolean, p_watermark timestamptz,
  p_watermark_id uuid, p_row_ids uuid[]
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
  -- The cursor moves only with an exported row (a run without rows keeps the starting pair).
  UPDATE itap.export_jobs
  SET status = 'completed', file_id = p_file, row_count = greatest(coalesce(p_row_count, 0), 0),
      truncated = coalesce(p_truncated, false), finished_at = now(), lease_expires_at = NULL,
      watermark_to = CASE WHEN j.mode = 'incremental' THEN coalesce(p_watermark, j.watermark_from) END,
      watermark_to_id = CASE WHEN j.mode = 'incremental' THEN CASE WHEN p_watermark IS NULL THEN j.watermark_from_id ELSE p_watermark_id END END,
      subject_ids = itap.export_subject_ids(j.organization_id, j.entity, coalesce(p_row_ids, '{}'))
  WHERE id = j.id
  RETURNING * INTO j;
  IF j.mode = 'incremental' AND p_watermark IS NOT NULL THEN
    UPDATE itap.export_definitions d
    SET watermark = p_watermark, watermark_id = p_watermark_id
    WHERE d.organization_id = j.organization_id AND d.id = j.definition_id AND d.mode = 'incremental'
      AND d.entity = j.entity AND d.filters = j.filters
      AND d.watermark IS NOT DISTINCT FROM j.watermark_from AND d.watermark_id IS NOT DISTINCT FROM j.watermark_from_id;
  END IF;
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes)
  VALUES (j.organization_id, j.requested_by, 'export', 'export_jobs', j.id,
          jsonb_build_object('definition_id', j.definition_id, 'entity', j.entity, 'format', j.format, 'mode', j.mode,
                             'row_count', j.row_count, 'truncated', j.truncated, 'file_id', j.file_id));
  RETURN NEXT j;
END;
$$;
