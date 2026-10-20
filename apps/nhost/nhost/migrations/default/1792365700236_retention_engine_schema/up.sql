-- Slice 10 task 2: retention engine schema and shared helpers.
-- * organization_settings.consent_embedding_retention_days (spec §8.1 consent_withdrawn window, default 30): the
--   embeddings_withdrawn class deletes biometrics this long after the biometric consent was withdrawn (an active
--   embeddings_withdrawn policy overrides the window).
-- * retention_runs: lease (resumable runner; a run left 'running' with a stale lease is closed as 'interrupted');
--   retention_run_classes: files_enqueued and one row per (run, class, facility).
-- * itap.retention_scope: what one purge call may touch (class, cutoff, facility, subject, action) plus the legal hold
--   snapshot, taken ONCE per call with the set helpers (held identities / profiles follow the person graph and merges;
--   incidents and facilities are direct targets). Candidate functions (itap.retention_candidates_<class>(scope) ->
--   (id, held)) are the single definition of what a class would purge: the purge functions take unheld ids from them,
--   the planner counts them.
-- * Files: purges never delete storage rows; itap.enqueue_unused_files queues files no other row references any more.

ALTER TABLE itap.organization_settings ADD COLUMN consent_embedding_retention_days integer NOT NULL DEFAULT 30
  CONSTRAINT organization_settings_consent_embedding_retention CHECK (consent_embedding_retention_days BETWEEN 1 AND 3650);

INSERT INTO itap.retention_run_statuses (value, description)
VALUES ('interrupted', 'Abandoned while running (stale lease); the next run continues the work');

ALTER TABLE itap.retention_runs ADD COLUMN lease_expires_at timestamptz;
ALTER TABLE itap.retention_run_classes ADD COLUMN files_enqueued integer NOT NULL DEFAULT 0
  CONSTRAINT retention_run_classes_files_enqueued CHECK (files_enqueued >= 0);
CREATE UNIQUE INDEX retention_run_classes_scope_key
  ON itap.retention_run_classes (organization_id, run_id, data_class, facility_id) NULLS NOT DISTINCT;

CREATE TYPE itap.retention_scope AS (
  organization_id uuid,
  data_class text,
  cutoff timestamptz,
  facility_id uuid,
  excluded_facilities uuid[],
  subject_identities uuid[],
  subject_profiles uuid[],
  action text,
  held_identities uuid[],
  held_profiles uuid[],
  held_incidents uuid[],
  held_facilities uuid[]
);

-- Builds the scope of one purge / count call. Facility precedence: an org-wide call (p_facility NULL, no subject)
-- excludes rows of facilities that have their own active policy for the class; rows without a facility follow the
-- org-wide policy. A subject (profile and / or identity) narrows the call to that person's graph (DSR erasure).
CREATE FUNCTION itap.retention_scope(p_class text, p_org uuid, p_cutoff timestamptz, p_facility uuid,
  p_subject_profile uuid, p_subject_identity uuid, p_action text, p_at timestamptz)
RETURNS itap.retention_scope
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  s itap.retention_scope;
BEGIN
  IF p_org IS NULL OR p_cutoff IS NULL OR p_at IS NULL THEN
    PERFORM itap.raise_code('retention_scope_invalid');
  END IF;
  IF NOT coalesce(itap.retention_action_allowed(p_class, p_action), false) THEN
    PERFORM itap.raise_code('retention_action_invalid');
  END IF;
  IF p_facility IS NOT NULL AND NOT itap.retention_class_has_facility(p_class) THEN
    PERFORM itap.raise_code('retention_facility_invalid');
  END IF;
  s.organization_id := p_org;
  s.data_class := p_class;
  s.cutoff := p_cutoff;
  s.facility_id := p_facility;
  s.action := p_action;
  s.excluded_facilities := '{}';
  IF p_subject_profile IS NOT NULL OR p_subject_identity IS NOT NULL THEN
    SELECT coalesce(array_agg(x.id) FILTER (WHERE x.kind = 'identity'), '{}'),
           coalesce(array_agg(x.id) FILTER (WHERE x.kind = 'profile'), '{}')
    INTO s.subject_identities, s.subject_profiles
    FROM itap.legal_hold_subjects(p_org, ARRAY[p_subject_identity], ARRAY[p_subject_profile]) x;
  ELSIF p_facility IS NULL AND itap.retention_class_has_facility(p_class) THEN
    s.excluded_facilities := ARRAY(
      SELECT p.facility_id FROM itap.retention_policies p
      WHERE p.organization_id = p_org AND p.data_class = p_class AND p.facility_id IS NOT NULL AND p.is_active);
  END IF;
  s.held_identities := ARRAY(SELECT itap.held_identity_ids(p_org, p_at));
  s.held_profiles := ARRAY(SELECT itap.held_profile_ids(p_org, p_at));
  SELECT coalesce(array_agg(DISTINCT t.incident_id) FILTER (WHERE t.incident_id IS NOT NULL), '{}'),
         coalesce(array_agg(DISTINCT t.facility_id) FILTER (WHERE t.facility_id IS NOT NULL), '{}')
  INTO s.held_incidents, s.held_facilities
  FROM itap.legal_hold_targets t
  JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
  WHERE t.organization_id = p_org AND h.starts_at <= p_at AND (h.ends_at IS NULL OR h.ends_at > p_at);
  RETURN s;
END;
$$;

-- Row predicates used by the candidate functions (plain SQL, inlinable).
CREATE FUNCTION itap.retention_in_facility(s itap.retention_scope, p_facility uuid) RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ((s).facility_id IS NULL OR p_facility = (s).facility_id)
    AND (p_facility IS NULL OR NOT (p_facility = ANY ((s).excluded_facilities)));
$$;

CREATE FUNCTION itap.retention_subject(s itap.retention_scope, p_identity uuid, p_profile uuid) RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT (s).subject_identities IS NULL
    OR coalesce(p_identity = ANY ((s).subject_identities), false)
    OR coalesce(p_profile = ANY ((s).subject_profiles), false);
$$;

CREATE FUNCTION itap.retention_held(s itap.retention_scope, p_identity uuid, p_profile uuid, p_facility uuid) RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT coalesce(p_identity = ANY ((s).held_identities), false)
    OR coalesce(p_profile = ANY ((s).held_profiles), false)
    OR coalesce(p_facility = ANY ((s).held_facilities), false);
$$;

-- A hold that has not ended yet (active or scheduled) targets the identity / incident: such rows are never deleted
-- (their legal_hold_targets FK is NO ACTION). Targets of ended holds are deleted with their subject.
CREATE FUNCTION itap.retention_open_hold_target(p_org uuid, p_identity uuid, p_incident uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM itap.legal_hold_targets t
    JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
    WHERE t.organization_id = p_org
      AND ((p_identity IS NOT NULL AND t.identity_id = p_identity) OR (p_incident IS NOT NULL AND t.incident_id = p_incident))
      AND (h.ends_at IS NULL OR h.ends_at > now()));
$$;

-- Whether any row still references the file (every file column of the schema).
CREATE FUNCTION itap.file_in_use(p_org uuid, p_file uuid) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
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
    OR EXISTS (SELECT 1 FROM itap.organizations x WHERE x.id = p_org AND x.logo_file_id = p_file);
$$;

-- Queues the files (after their rows were deleted / detached) that nothing references any more; returns how many.
CREATE FUNCTION itap.enqueue_unused_files(p_org uuid, p_files uuid[], p_reason text) RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  f uuid;
  n integer := 0;
BEGIN
  FOR f IN SELECT DISTINCT x FROM unnest(coalesce(p_files, '{}')) x WHERE x IS NOT NULL LOOP
    IF NOT itap.file_in_use(p_org, f)
       AND NOT EXISTS (SELECT 1 FROM itap.pending_file_deletions q WHERE q.file_id = f)
       AND itap.enqueue_file_deletion(p_org, f, p_reason) THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;

-- Files of the organization bucket tagged with one of the ids under metadata.<key> (report_id / bulk_job_id).
CREATE FUNCTION itap.tagged_files(p_org uuid, p_key text, p_ids uuid[]) RETURNS uuid[]
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT coalesce(array_agg(f.id), '{}') FROM storage.files f
  WHERE f.bucket_id = p_org::text AND f.metadata ->> p_key = ANY (SELECT x::text FROM unnest(p_ids) x);
$$;

-- Row type of itap.retention_plan (org_admin dry run).
CREATE TABLE itap_results.retention_plan_rows (
  organization_id uuid NOT NULL,
  data_class text NOT NULL,
  facility_id uuid,
  policy_id uuid,
  action text NOT NULL,
  retain_days integer NOT NULL,
  cutoff timestamptz NOT NULL,
  candidates bigint NOT NULL,
  held bigint NOT NULL
);
