-- Export files (slice 10 task 4): kind `export` is owner-only (visible / openable by the requesting member, who
-- becomes the uploader) and sensitive (never selectable directly, audited open). check_file_bucket therefore refuses
-- it on every other file column; export_jobs.file_id is checked by complete_export_job. itap.file_in_use covers the new
-- file columns (export_jobs.file_id, integration_sync_runs.fixture_file_id) and the HR fixture referenced by
-- integrations.config.fixture_file_id.
CREATE OR REPLACE FUNCTION itap.owner_only_file_kinds()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$ SELECT ARRAY['search', 'bulk_input', 'bulk_search_result', 'export'] $function$

;

CREATE OR REPLACE FUNCTION itap.file_in_use(p_org uuid, p_file uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
  SELECT EXISTS (SELECT 1 FROM itap.identity_photos x WHERE x.organization_id = p_org AND x.file_id = p_file)
    OR EXISTS (SELECT 1 FROM itap.identities x WHERE x.organization_id = p_org AND x.primary_photo_file_id = p_file)
    OR EXISTS (SELECT 1 FROM itap.identity_embeddings x WHERE x.organization_id = p_org AND x.photo_file_id = p_file)
    OR EXISTS (SELECT 1 FROM itap.profiles x WHERE x.organization_id = p_org AND x.avatar_file_id = p_file)
    OR EXISTS (SELECT 1 FROM itap.profile_documents x WHERE x.organization_id = p_org AND x.file_id = p_file)
    OR EXISTS (SELECT 1 FROM itap.consent_records x WHERE x.organization_id = p_org AND x.document_file_id = p_file)
    OR EXISTS (SELECT 1 FROM itap.floor_plans x WHERE x.organization_id = p_org AND x.image_file_id = p_file)
    OR EXISTS (SELECT 1 FROM itap.detections x WHERE x.organization_id = p_org AND x.thumbnail_file_id = p_file)
    OR EXISTS (SELECT 1 FROM itap.incident_note_files x WHERE x.organization_id = p_org AND x.file_id = p_file)
    OR EXISTS (SELECT 1 FROM itap.reports x WHERE x.organization_id = p_org AND x.file_id = p_file)
    OR EXISTS (SELECT 1 FROM itap.saved_searches x WHERE x.organization_id = p_org AND x.image_file_id = p_file)
    OR EXISTS (SELECT 1 FROM itap.search_requests x WHERE x.organization_id = p_org AND x.image_file_id = p_file)
    OR EXISTS (SELECT 1 FROM itap.bulk_jobs x WHERE x.organization_id = p_org AND (x.input_file_id = p_file OR x.result_file_id = p_file))
    OR EXISTS (SELECT 1 FROM itap.authentication_attempts x WHERE x.organization_id = p_org AND x.evidence_file_id = p_file)
    OR EXISTS (SELECT 1 FROM itap.data_subject_requests x WHERE x.organization_id = p_org AND x.export_file_id = p_file)
    OR EXISTS (SELECT 1 FROM itap.processing_activities x WHERE x.organization_id = p_org AND x.dpia_file_id = p_file)
    OR EXISTS (SELECT 1 FROM itap.export_jobs x WHERE x.organization_id = p_org AND x.file_id = p_file)
    OR EXISTS (SELECT 1 FROM itap.integration_sync_runs x WHERE x.organization_id = p_org AND x.fixture_file_id = p_file)
    OR EXISTS (SELECT 1 FROM itap.integrations x WHERE x.organization_id = p_org AND x.config ->> 'fixture_file_id' = p_file::text)
    OR EXISTS (SELECT 1 FROM itap.organizations x WHERE x.id = p_org AND x.logo_file_id = p_file);
$function$

;
