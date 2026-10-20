-- Authentication sessions and the evidentiary attempt record (spec §6.16, SA_6 §2.1.7).
--
-- authentication_sessions: every authentication runs under a session opened by the backend service (nonce of
-- 32 random bytes returned once, stored as a hash; 5-minute lifetime). Steps: initial -> recapture (<= 2) ->
-- second_factor; status open -> succeeded / failed / review / expired (review closes through
-- review_authentication_attempt). Written by the backend (admin); org_admin reads (nonce_hash never selectable).
-- Not audited: the attempts are the record.
CREATE TABLE itap.authentication_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  application_id uuid NOT NULL,
  key_id uuid,
  mode text NOT NULL REFERENCES itap.auth_modes (value),
  claimed_identity_id uuid,
  access_point_id uuid,
  device_ref text,
  nonce_hash text NOT NULL,
  status text NOT NULL DEFAULT 'open' REFERENCES itap.auth_session_statuses (value),
  step text NOT NULL DEFAULT 'initial' REFERENCES itap.auth_steps (value),
  step_count integer NOT NULL DEFAULT 0,
  recapture_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  created_ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT authentication_sessions_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT authentication_sessions_counts CHECK (step_count >= 0 AND recapture_count BETWEEN 0 AND 2),
  CONSTRAINT authentication_sessions_closed CHECK ((status IN ('open', 'review')) = (closed_at IS NULL)),
  CONSTRAINT authentication_sessions_expiry CHECK (expires_at > created_at),
  CONSTRAINT authentication_sessions_application_fkey FOREIGN KEY (organization_id, application_id)
    REFERENCES itap.client_applications (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT authentication_sessions_key_fkey FOREIGN KEY (organization_id, key_id)
    REFERENCES itap.client_application_keys (organization_id, id) ON DELETE SET NULL (key_id),
  CONSTRAINT authentication_sessions_claimed_identity_fkey FOREIGN KEY (organization_id, claimed_identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE SET NULL (claimed_identity_id),
  CONSTRAINT authentication_sessions_access_point_fkey FOREIGN KEY (organization_id, access_point_id)
    REFERENCES itap.access_points (organization_id, id) ON DELETE SET NULL (access_point_id)
);
CREATE INDEX authentication_sessions_organization_id_application_id_created_at_idx
  ON itap.authentication_sessions (organization_id, application_id, created_at);
CREATE INDEX authentication_sessions_organization_id_key_id_idx ON itap.authentication_sessions (organization_id, key_id);
CREATE INDEX authentication_sessions_organization_id_mode_idx ON itap.authentication_sessions (organization_id, mode);
CREATE INDEX authentication_sessions_organization_id_claimed_identity_id_idx
  ON itap.authentication_sessions (organization_id, claimed_identity_id);
CREATE INDEX authentication_sessions_organization_id_access_point_id_idx
  ON itap.authentication_sessions (organization_id, access_point_id);
CREATE INDEX authentication_sessions_organization_id_status_expires_at_idx
  ON itap.authentication_sessions (organization_id, status, expires_at);
CREATE INDEX authentication_sessions_organization_id_step_idx ON itap.authentication_sessions (organization_id, step);

CREATE TRIGGER authentication_sessions_set_updated_at BEFORE UPDATE ON itap.authentication_sessions
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();

-- authentication_attempts: one row per capture decision (ro, append-only, not audited: high volume). Retrieval
-- (stage 1: retrieval_candidates, retrieval_hit, retrieval_ms) and comparison (stage 2: comparison_score,
-- comparison_ms) are recorded separately; attack resistance (attack_outcome, attack_details) separately from the
-- match outcome. evidence_file_id: the one frame kept for partial / failure / attack outcomes (kind auth_capture,
-- a sensitive kind: hidden from storage selects, opened via open_file which audits view_sensitive); successes keep
-- no image. People, places, files and the session are SET NULL so retention / erasure can remove them; the
-- application is NO ACTION (attribution; retire an app with status revoked).
CREATE TABLE itap.authentication_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  application_id uuid NOT NULL,
  session_id uuid,
  attempt_no integer NOT NULL,
  step text NOT NULL REFERENCES itap.auth_steps (value),
  mode text NOT NULL REFERENCES itap.auth_modes (value),
  claimed_identity_id uuid,
  matched_identity_id uuid,
  profile_id uuid,
  access_point_id uuid,
  device_ref text,
  outcome text NOT NULL REFERENCES itap.auth_outcomes (value),
  review_status text NOT NULL DEFAULT 'none' REFERENCES itap.auth_review_statuses (value),
  confidence real,
  threshold_used real,
  population_size integer NOT NULL DEFAULT 0,
  population_scope jsonb NOT NULL DEFAULT '{}',
  retrieval_candidates integer,
  retrieval_hit boolean,
  comparison_score real,
  failure_reason text REFERENCES itap.auth_failure_reasons (value),
  attack_outcome text NOT NULL DEFAULT 'not_checked' REFERENCES itap.auth_attack_outcomes (value),
  attack_details jsonb NOT NULL DEFAULT '{}',
  quality jsonb NOT NULL DEFAULT '{}',
  sequence_digest text,
  model_version text,
  evidence_file_id uuid REFERENCES storage.files (id) ON DELETE SET NULL,
  latency_ms integer,
  retrieval_ms real,
  comparison_ms real,
  ip inet,
  user_agent text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT authentication_attempts_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT authentication_attempts_session_attempt_key UNIQUE (organization_id, session_id, attempt_no),
  CONSTRAINT authentication_attempts_attempt_no_positive CHECK (attempt_no >= 1),
  CONSTRAINT authentication_attempts_scores CHECK (
    (confidence IS NULL OR confidence BETWEEN -1 AND 1)
    AND (comparison_score IS NULL OR comparison_score BETWEEN -1 AND 1)
    AND (threshold_used IS NULL OR threshold_used BETWEEN 0 AND 1)
  ),
  CONSTRAINT authentication_attempts_counts CHECK (
    population_size >= 0 AND (retrieval_candidates IS NULL OR retrieval_candidates >= 0)
    AND (latency_ms IS NULL OR latency_ms >= 0)
  ),
  CONSTRAINT authentication_attempts_json_objects CHECK (
    jsonb_typeof(population_scope) = 'object' AND jsonb_typeof(attack_details) = 'object' AND jsonb_typeof(quality) = 'object'
  ),
  -- A success has no failure reason; a failure always has one (a partial match may carry a hint).
  CONSTRAINT authentication_attempts_failure_reason CHECK (
    (outcome <> 'success' OR failure_reason IS NULL) AND (outcome <> 'failure' OR failure_reason IS NOT NULL)
  ),
  CONSTRAINT authentication_attempts_review_status CHECK (review_status = 'none' OR outcome <> 'success'),
  CONSTRAINT authentication_attempts_reviewed CHECK (
    (review_status IN ('approved', 'rejected')) = (reviewed_at IS NOT NULL) AND (reviewed_at IS NOT NULL OR reviewed_by IS NULL)
  ),
  CONSTRAINT authentication_attempts_application_fkey FOREIGN KEY (organization_id, application_id)
    REFERENCES itap.client_applications (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT authentication_attempts_session_fkey FOREIGN KEY (organization_id, session_id)
    REFERENCES itap.authentication_sessions (organization_id, id) ON DELETE SET NULL (session_id),
  CONSTRAINT authentication_attempts_claimed_identity_fkey FOREIGN KEY (organization_id, claimed_identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE SET NULL (claimed_identity_id),
  CONSTRAINT authentication_attempts_matched_identity_fkey FOREIGN KEY (organization_id, matched_identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE SET NULL (matched_identity_id),
  CONSTRAINT authentication_attempts_profile_fkey FOREIGN KEY (organization_id, profile_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE SET NULL (profile_id),
  CONSTRAINT authentication_attempts_access_point_fkey FOREIGN KEY (organization_id, access_point_id)
    REFERENCES itap.access_points (organization_id, id) ON DELETE SET NULL (access_point_id),
  CONSTRAINT authentication_attempts_reviewed_by_fkey FOREIGN KEY (organization_id, reviewed_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
-- Investigation search: application, identity, session, outcome, period.
CREATE INDEX authentication_attempts_organization_id_attempted_at_idx
  ON itap.authentication_attempts (organization_id, attempted_at);
CREATE INDEX authentication_attempts_organization_id_application_id_attempted_at_idx
  ON itap.authentication_attempts (organization_id, application_id, attempted_at);
CREATE INDEX authentication_attempts_organization_id_matched_identity_id_attempted_at_idx
  ON itap.authentication_attempts (organization_id, matched_identity_id, attempted_at);
CREATE INDEX authentication_attempts_organization_id_session_id_idx
  ON itap.authentication_attempts (organization_id, session_id);
CREATE INDEX authentication_attempts_organization_id_outcome_attempted_at_idx
  ON itap.authentication_attempts (organization_id, outcome, attempted_at);
CREATE INDEX authentication_attempts_organization_id_claimed_identity_id_idx
  ON itap.authentication_attempts (organization_id, claimed_identity_id);
CREATE INDEX authentication_attempts_organization_id_profile_id_idx ON itap.authentication_attempts (organization_id, profile_id);
CREATE INDEX authentication_attempts_organization_id_access_point_id_idx
  ON itap.authentication_attempts (organization_id, access_point_id);
CREATE INDEX authentication_attempts_organization_id_evidence_file_id_idx
  ON itap.authentication_attempts (organization_id, evidence_file_id);
CREATE INDEX authentication_attempts_organization_id_review_status_attempted_at_idx
  ON itap.authentication_attempts (organization_id, review_status, attempted_at);
CREATE INDEX authentication_attempts_organization_id_attack_outcome_attempted_at_idx
  ON itap.authentication_attempts (organization_id, attack_outcome, attempted_at);
CREATE INDEX authentication_attempts_organization_id_failure_reason_idx
  ON itap.authentication_attempts (organization_id, failure_reason);
CREATE INDEX authentication_attempts_organization_id_step_idx ON itap.authentication_attempts (organization_id, step);
CREATE INDEX authentication_attempts_organization_id_mode_idx ON itap.authentication_attempts (organization_id, mode);
CREATE INDEX authentication_attempts_organization_id_reviewed_by_idx ON itap.authentication_attempts (organization_id, reviewed_by);

-- Append-only: an update may only (a) null the SET NULL reference columns (FK actions of retention / erasure) or
-- (b) write the review columns under itap.auth_review_context (review_authentication_attempt). Evidence files must
-- be of the sensitive kind auth_capture.
CREATE FUNCTION itap.guard_authentication_attempt() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  nullable_refs text[] := ARRAY['session_id', 'claimed_identity_id', 'matched_identity_id', 'profile_id',
    'access_point_id', 'evidence_file_id'];
  review_cols text[] := ARRAY['review_status', 'reviewed_by', 'reviewed_at', 'review_note'];
  in_review boolean := coalesce(current_setting('itap.auth_review_context', true), '') = 'on';
  changed text;
  file_kind text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.evidence_file_id IS NOT NULL THEN
      SELECT f.metadata ->> 'kind' INTO file_kind FROM storage.files f WHERE f.id = NEW.evidence_file_id;
      IF file_kind IS DISTINCT FROM 'auth_capture' THEN
        PERFORM itap.raise_code('auth_evidence_kind');
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  FOR changed IN
    SELECT n.key FROM jsonb_each(to_jsonb(NEW)) n
    WHERE n.value IS DISTINCT FROM to_jsonb(OLD) -> n.key
  LOOP
    IF changed = ANY (nullable_refs) AND to_jsonb(NEW) -> changed = 'null'::jsonb THEN
      CONTINUE;
    END IF;
    IF in_review AND changed = ANY (review_cols) THEN
      CONTINUE;
    END IF;
    PERFORM itap.raise_code('authentication_attempt_immutable');
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER authentication_attempts_check_files BEFORE INSERT ON itap.authentication_attempts
  FOR EACH ROW EXECUTE FUNCTION itap.check_file_bucket('evidence_file_id');
CREATE TRIGGER authentication_attempts_guard BEFORE INSERT OR UPDATE ON itap.authentication_attempts
  FOR EACH ROW EXECUTE FUNCTION itap.guard_authentication_attempt();

-- Sequence digests seen (sha256 of the submitted frames): a digest seen before is a replay (attack_outcome
-- injection). Internal, not exposed.
CREATE TABLE itap.auth_sequence_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  digest text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  attempt_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_sequence_digests_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT auth_sequence_digests_digest_key UNIQUE (organization_id, digest),
  CONSTRAINT auth_sequence_digests_digest_not_blank CHECK (btrim(digest) <> ''),
  CONSTRAINT auth_sequence_digests_attempt_fkey FOREIGN KEY (organization_id, attempt_id)
    REFERENCES itap.authentication_attempts (organization_id, id) ON DELETE SET NULL (attempt_id)
);
CREATE INDEX auth_sequence_digests_organization_id_attempt_id_idx ON itap.auth_sequence_digests (organization_id, attempt_id);

-- Tracked mutation (org_admin, active member): manual review of an attempt waiting for it. Approve -> session
-- succeeded, reject -> session failed (when still open / in review); explicit audit row approve / reject.
CREATE FUNCTION itap.review_authentication_attempt(hasura_session json, p_attempt uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS SETOF itap.authentication_attempts
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.require_active_member(hasura_session);
  current_status text;
  session uuid;
  note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF p_approve IS NULL THEN
    PERFORM itap.raise_code('auth_review_decision_required');
  END IF;
  SELECT review_status, session_id INTO current_status, session FROM itap.authentication_attempts
  WHERE organization_id = org AND id = p_attempt FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('auth_attempt_not_found');
  END IF;
  IF current_status <> 'pending' THEN
    PERFORM itap.raise_code('auth_attempt_not_pending');
  END IF;
  PERFORM set_config('itap.auth_review_context', 'on', true);
  UPDATE itap.authentication_attempts
  SET review_status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      reviewed_by = actor, reviewed_at = now(), review_note = note
  WHERE organization_id = org AND id = p_attempt;
  PERFORM set_config('itap.auth_review_context', 'off', true);
  IF session IS NOT NULL THEN
    UPDATE itap.authentication_sessions
    SET status = CASE WHEN p_approve THEN 'succeeded' ELSE 'failed' END, closed_at = now()
    WHERE organization_id = org AND id = session AND status IN ('open', 'review');
  END IF;
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes, reason)
  VALUES (org, actor, CASE WHEN p_approve THEN 'approve' ELSE 'reject' END, 'authentication_attempts', p_attempt,
          jsonb_build_object('review_status', jsonb_build_array('pending', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END),
                             'session_id', session),
          note);
  RETURN QUERY SELECT * FROM itap.authentication_attempts WHERE organization_id = org AND id = p_attempt;
END;
$$;
