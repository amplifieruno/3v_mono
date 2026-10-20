-- Slice 10 task 2: purge functions of the biometric / identity / face-auth classes (contract: migration 237).

-- Every face file of identities (photos, embedding source photos, primary photo).
CREATE FUNCTION itap.identity_face_files(p_org uuid, p_ids uuid[]) RETURNS uuid[]
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT ARRAY(
    SELECT p.file_id FROM itap.identity_photos p WHERE p.organization_id = p_org AND p.identity_id = ANY (p_ids)
    UNION SELECT e.photo_file_id FROM itap.identity_embeddings e
          WHERE e.organization_id = p_org AND e.identity_id = ANY (p_ids) AND e.photo_file_id IS NOT NULL
    UNION SELECT i.primary_photo_file_id FROM itap.identities i
          WHERE i.organization_id = p_org AND i.id = ANY (p_ids) AND i.primary_photo_file_id IS NOT NULL);
$$;

-- Deletes the biometric data of identities (templates -> centroid via triggers, photos, primary photo reference);
-- returns the face files to enqueue.
CREATE FUNCTION itap.delete_identity_biometrics(p_org uuid, p_ids uuid[]) RETURNS uuid[]
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  v_files uuid[] := itap.identity_face_files(p_org, p_ids);
BEGIN
  DELETE FROM itap.identity_embeddings e WHERE e.organization_id = p_org AND e.identity_id = ANY (p_ids);
  DELETE FROM itap.identity_centroids c WHERE c.organization_id = p_org AND c.identity_id = ANY (p_ids);
  DELETE FROM itap.identity_photos p WHERE p.organization_id = p_org AND p.identity_id = ANY (p_ids);
  UPDATE itap.identities i SET primary_photo_file_id = NULL
  WHERE i.organization_id = p_org AND i.id = ANY (p_ids) AND i.primary_photo_file_id IS NOT NULL;
  RETURN v_files;
END;
$$;

-- photos: identity photos of archived unknown (unlinked) identities, by photo age.
CREATE FUNCTION itap.retention_candidates_photos(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT p.id, itap.retention_held(s, p.identity_id, NULL, NULL)
  FROM itap.identity_photos p
  JOIN itap.identities i ON i.organization_id = p.organization_id AND i.id = p.identity_id
  WHERE p.organization_id = (s).organization_id AND p.created_at < (s).cutoff
    AND i.status = 'archived' AND i.profile_id IS NULL AND itap.retention_subject(s, p.identity_id, NULL);
$$;

CREATE FUNCTION itap.purge_photos(p_org uuid, p_cutoff timestamptz, p_facility uuid, p_subject_profile uuid,
  p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('photos', p_org, p_cutoff, p_facility, p_subject_profile,
    p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  v_files uuid[];
  n integer;
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  v_files := ARRAY(SELECT p.file_id FROM itap.identity_photos p WHERE p.organization_id = p_org AND p.id = ANY (v_ids));
  DELETE FROM itap.identity_photos p WHERE p.organization_id = p_org AND p.id = ANY (v_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE itap.identities i SET primary_photo_file_id = NULL
  WHERE i.organization_id = p_org AND i.primary_photo_file_id = ANY (v_files);
  UPDATE itap.identity_embeddings e SET photo_file_id = NULL
  WHERE e.organization_id = p_org AND e.photo_file_id = ANY (v_files);
  RETURN QUERY SELECT n, v_held, itap.enqueue_unused_files(p_org, v_files, 'retention:photos');
  PERFORM itap.retention_end(prev);
END;
$$;

-- embeddings_withdrawn (spec §8.1 consent_withdrawn): identities of a profile whose latest biometric_processing
-- consent was withdrawn before the cutoff (runner: settings window, default 30 days) and that still hold biometrics.
CREATE FUNCTION itap.retention_candidates_embeddings_withdrawn(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT i.id, itap.retention_held(s, i.id, i.profile_id, NULL)
  FROM itap.identities i
  CROSS JOIN LATERAL (
    SELECT c.status, c.withdrawn_at FROM itap.consent_records c
    WHERE c.organization_id = i.organization_id AND c.profile_id = i.profile_id AND c.purpose = 'biometric_processing'
    ORDER BY coalesce(c.withdrawn_at, c.granted_at) DESC, c.created_at DESC, c.id DESC
    LIMIT 1
  ) consent
  WHERE i.organization_id = (s).organization_id AND i.profile_id IS NOT NULL AND NOT i.matching_enabled
    AND consent.status = 'withdrawn' AND consent.withdrawn_at < (s).cutoff
    AND itap.retention_subject(s, i.id, i.profile_id)
    AND (i.primary_photo_file_id IS NOT NULL
         OR EXISTS (SELECT 1 FROM itap.identity_embeddings e WHERE e.organization_id = i.organization_id AND e.identity_id = i.id)
         OR EXISTS (SELECT 1 FROM itap.identity_photos p WHERE p.organization_id = i.organization_id AND p.identity_id = i.id)
         OR EXISTS (SELECT 1 FROM itap.identity_centroids c WHERE c.organization_id = i.organization_id AND c.identity_id = i.id));
$$;

CREATE FUNCTION itap.purge_embeddings_withdrawn(p_org uuid, p_cutoff timestamptz, p_facility uuid,
  p_subject_profile uuid, p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('embeddings_withdrawn', p_org, p_cutoff, p_facility,
    p_subject_profile, p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  v_files uuid[];
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  v_files := itap.delete_identity_biometrics(p_org, v_ids);
  RETURN QUERY SELECT cardinality(v_ids), v_held, itap.enqueue_unused_files(p_org, v_files, 'retention:embeddings_withdrawn');
  PERFORM itap.retention_end(prev);
END;
$$;

-- unknown_identities: unlinked, non-synthetic camera / manual identities not seen since the cutoff. Kept: merged
-- identities and merge participants (NO ACTION history), identities named in incidents or on watch lists, targets of
-- holds that have not ended. delete = the identity with everything it owns (biometrics, memberships, stats; logs keep
-- their rows with identity NULL); anonymize = biometrics deleted, attributes / custom fields emptied, matching off.
CREATE FUNCTION itap.retention_candidates_unknown_identities(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT i.id, itap.retention_held(s, i.id, NULL, NULL)
  FROM itap.identities i
  WHERE i.organization_id = (s).organization_id AND i.profile_id IS NULL AND NOT i.is_synthetic
    AND i.status <> 'merged' AND coalesce(i.last_seen_at, i.created_at) < (s).cutoff
    AND itap.retention_subject(s, i.id, NULL)
    AND NOT EXISTS (SELECT 1 FROM itap.identity_merge_sources x WHERE x.organization_id = i.organization_id AND x.source_identity_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM itap.identity_merges x WHERE x.organization_id = i.organization_id AND x.target_identity_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM itap.identity_merge_moves x WHERE x.organization_id = i.organization_id AND x.from_identity_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM itap.incident_identities x WHERE x.organization_id = i.organization_id AND x.identity_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM itap.watch_list_entries x WHERE x.organization_id = i.organization_id AND x.identity_id = i.id)
    AND (i.id = ANY ((s).held_identities) OR NOT itap.retention_open_hold_target(i.organization_id, i.id, NULL))
    AND ((s).action = 'delete' OR i.attributes <> '{"anonymized": true}'::jsonb OR i.matching_enabled
         OR i.primary_photo_file_id IS NOT NULL
         OR EXISTS (SELECT 1 FROM itap.identity_embeddings e WHERE e.organization_id = i.organization_id AND e.identity_id = i.id)
         OR EXISTS (SELECT 1 FROM itap.identity_photos p WHERE p.organization_id = i.organization_id AND p.identity_id = i.id));
$$;

CREATE FUNCTION itap.purge_unknown_identities(p_org uuid, p_cutoff timestamptz, p_facility uuid,
  p_subject_profile uuid, p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('unknown_identities', p_org, p_cutoff, p_facility,
    p_subject_profile, p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  v_files uuid[];
  n integer;
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  -- Tracking writers serialise per identity (conventions, detection pipeline): advisory locks first, id order.
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:' || x::text, 0)) FROM unnest(v_ids) x ORDER BY x;
  v_files := itap.delete_identity_biometrics(p_org, v_ids);
  IF p_action = 'delete' THEN
    DELETE FROM itap.legal_hold_targets t WHERE t.organization_id = p_org AND t.identity_id = ANY (v_ids);
    DELETE FROM itap.identities i WHERE i.organization_id = p_org AND i.id = ANY (v_ids);
    GET DIAGNOSTICS n = ROW_COUNT;
  ELSE
    UPDATE itap.identities i SET attributes = '{"anonymized": true}'::jsonb, custom_fields = '{}'::jsonb,
      matching_enabled = false
    WHERE i.organization_id = p_org AND i.id = ANY (v_ids);
    GET DIAGNOSTICS n = ROW_COUNT;
  END IF;
  RETURN QUERY SELECT n, v_held, itap.enqueue_unused_files(p_org, v_files, 'retention:unknown_identities');
  PERFORM itap.retention_end(prev);
END;
$$;

-- auth_attempts: attempts by attempt time (+ their replay digests), closed sessions no attempt still needs, and in
-- org-wide delete calls also orphan digests, revoked / expired client keys, revoked sandbox applications nothing refers
-- to, and synthetic identities no attempt names once no sandbox application is in use (summary-09 purge list). anonymize = person, network, device, scores, attack details,
-- quality and evidence removed (outcome, step, mode, times, population size kept); sessions lose ip, user agent,
-- device and claim (the claim hash is replaced by a random one).
CREATE FUNCTION itap.retention_candidates_auth_attempts(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT a.id, itap.retention_held(s, a.matched_identity_id, a.profile_id, NULL)
           OR coalesce(a.claimed_identity_id = ANY ((s).held_identities), false)
  FROM itap.authentication_attempts a
  WHERE a.organization_id = (s).organization_id AND a.attempted_at < (s).cutoff
    AND (itap.retention_subject(s, a.matched_identity_id, a.profile_id)
         OR coalesce(a.claimed_identity_id = ANY ((s).subject_identities), false))
    AND ((s).action = 'delete' OR a.matched_identity_id IS NOT NULL OR a.claimed_identity_id IS NOT NULL
         OR a.profile_id IS NOT NULL OR a.ip IS NOT NULL OR a.user_agent IS NOT NULL OR a.device_ref IS NOT NULL
         OR a.confidence IS NOT NULL OR a.comparison_score IS NOT NULL OR a.evidence_file_id IS NOT NULL
         OR a.review_note IS NOT NULL OR a.sequence_digest IS NOT NULL OR a.attack_details <> '{}'::jsonb
         OR a.quality <> '{}'::jsonb);
$$;

CREATE FUNCTION itap.purge_auth_attempts(p_org uuid, p_cutoff timestamptz, p_facility uuid, p_subject_profile uuid,
  p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('auth_attempts', p_org, p_cutoff, p_facility, p_subject_profile,
    p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  org_wide boolean := p_subject_profile IS NULL AND p_subject_identity IS NULL;
  v_held integer;
  v_ids uuid[];
  v_files uuid[];
  v_sessions uuid[];
  v_synthetic uuid[];
  n integer;
  total integer := 0;
BEGIN
  IF org_wide AND p_cutoff > now() - make_interval(days => itap.retention_min_days('auth_attempts')) THEN
    PERFORM itap.raise_code('retention_floor');
  END IF;
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  v_files := ARRAY(SELECT a.evidence_file_id FROM itap.authentication_attempts a
                   WHERE a.organization_id = p_org AND a.id = ANY (v_ids) AND a.evidence_file_id IS NOT NULL);
  v_sessions := ARRAY(SELECT DISTINCT a.session_id FROM itap.authentication_attempts a
                      WHERE a.organization_id = p_org AND a.id = ANY (v_ids) AND a.session_id IS NOT NULL);
  DELETE FROM itap.auth_sequence_digests g WHERE g.organization_id = p_org AND g.attempt_id = ANY (v_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + n;
  IF p_action = 'delete' THEN
    DELETE FROM itap.authentication_attempts a WHERE a.organization_id = p_org AND a.id = ANY (v_ids);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
    -- Closed sessions of these attempts that no remaining attempt references.
    DELETE FROM itap.authentication_sessions x
    WHERE x.organization_id = p_org AND x.id = ANY (v_sessions) AND x.status NOT IN ('open', 'review')
      AND NOT EXISTS (SELECT 1 FROM itap.authentication_attempts a WHERE a.organization_id = p_org AND a.session_id = x.id);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
    IF org_wide THEN
      DELETE FROM itap.auth_sequence_digests g
      WHERE g.id IN (SELECT g2.id FROM itap.auth_sequence_digests g2
                     WHERE g2.organization_id = p_org AND g2.attempt_id IS NULL AND g2.first_seen_at < p_cutoff
                     LIMIT p_limit);
      GET DIAGNOSTICS n = ROW_COUNT;
      total := total + n;
      DELETE FROM itap.authentication_sessions x
      WHERE x.id IN (SELECT x2.id FROM itap.authentication_sessions x2
                     WHERE x2.organization_id = p_org AND x2.status NOT IN ('open', 'review') AND x2.closed_at < p_cutoff
                       AND NOT coalesce(x2.claimed_identity_id = ANY (s.held_identities), false)
                       AND NOT EXISTS (SELECT 1 FROM itap.authentication_attempts a
                                       WHERE a.organization_id = p_org AND a.session_id = x2.id)
                     LIMIT p_limit);
      GET DIAGNOSTICS n = ROW_COUNT;
      total := total + n;
      DELETE FROM itap.client_application_keys k
      WHERE k.id IN (SELECT k2.id FROM itap.client_application_keys k2
                     WHERE k2.organization_id = p_org AND (k2.revoked_at < p_cutoff OR k2.expires_at < p_cutoff)
                     LIMIT p_limit);
      GET DIAGNOSTICS n = ROW_COUNT;
      total := total + n;
      -- Revoked sandbox applications nothing refers to any more (bindings and keys CASCADE).
      DELETE FROM itap.client_applications c
      WHERE c.id IN (SELECT c2.id FROM itap.client_applications c2
                     WHERE c2.organization_id = p_org AND c2.is_sandbox AND c2.status = 'revoked' AND c2.updated_at < p_cutoff
                       AND NOT EXISTS (SELECT 1 FROM itap.authentication_attempts a WHERE a.organization_id = p_org AND a.application_id = c2.id)
                       AND NOT EXISTS (SELECT 1 FROM itap.authentication_sessions x WHERE x.organization_id = p_org AND x.application_id = c2.id)
                     LIMIT p_limit);
      GET DIAGNOSTICS n = ROW_COUNT;
      total := total + n;
      -- Synthetic (sandbox) identities once no sandbox application is left in use and no attempt names them.
      IF NOT EXISTS (SELECT 1 FROM itap.client_applications c WHERE c.organization_id = p_org AND c.is_sandbox AND c.status <> 'revoked') THEN
        v_synthetic := ARRAY(
          SELECT i.id FROM itap.identities i
          WHERE i.organization_id = p_org AND i.is_synthetic AND i.created_at < p_cutoff
            AND NOT (i.id = ANY (s.held_identities))
            AND NOT EXISTS (SELECT 1 FROM itap.authentication_attempts a WHERE a.organization_id = p_org
                            AND (a.matched_identity_id = i.id OR a.claimed_identity_id = i.id))
            AND NOT itap.retention_open_hold_target(p_org, i.id, NULL)
          ORDER BY i.id LIMIT p_limit);
        PERFORM pg_advisory_xact_lock(hashtextextended('identity:' || x::text, 0)) FROM unnest(v_synthetic) x ORDER BY x;
        v_files := v_files || itap.delete_identity_biometrics(p_org, v_synthetic);
        DELETE FROM itap.legal_hold_targets t WHERE t.organization_id = p_org AND t.identity_id = ANY (v_synthetic);
        DELETE FROM itap.identities i WHERE i.organization_id = p_org AND i.id = ANY (v_synthetic);
        GET DIAGNOSTICS n = ROW_COUNT;
        total := total + n;
      END IF;
    END IF;
  ELSE
    UPDATE itap.authentication_attempts a
    SET matched_identity_id = NULL, claimed_identity_id = NULL, profile_id = NULL, ip = NULL, user_agent = NULL,
        device_ref = NULL, confidence = NULL, comparison_score = NULL, evidence_file_id = NULL, review_note = NULL,
        sequence_digest = NULL, attack_details = '{}'::jsonb, quality = '{}'::jsonb
    WHERE a.organization_id = p_org AND a.id = ANY (v_ids);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
    UPDATE itap.authentication_sessions x
    SET claimed_identity_id = NULL, created_ip = NULL, user_agent = NULL, device_ref = NULL,
        nonce_hash = 'anonymized',
        claimed_ref_hash = CASE WHEN x.claimed_ref_hash IS NULL THEN NULL
                                ELSE encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex') END
    WHERE x.organization_id = p_org AND x.id = ANY (v_sessions) AND x.status NOT IN ('open', 'review')
      AND x.nonce_hash <> 'anonymized';
  END IF;
  RETURN QUERY SELECT total, v_held, itap.enqueue_unused_files(p_org, v_files, 'retention:auth_attempts');
  PERFORM itap.retention_end(prev);
END;
$$;

-- auth_evidence: evidence frames (auth_capture) of attempts older than the cutoff; the attempt keeps its row.
CREATE FUNCTION itap.retention_candidates_auth_evidence(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT a.id, itap.retention_held(s, a.matched_identity_id, a.profile_id, NULL)
           OR coalesce(a.claimed_identity_id = ANY ((s).held_identities), false)
  FROM itap.authentication_attempts a
  WHERE a.organization_id = (s).organization_id AND a.attempted_at < (s).cutoff AND a.evidence_file_id IS NOT NULL
    AND (itap.retention_subject(s, a.matched_identity_id, a.profile_id)
         OR coalesce(a.claimed_identity_id = ANY ((s).subject_identities), false));
$$;

CREATE FUNCTION itap.purge_auth_evidence(p_org uuid, p_cutoff timestamptz, p_facility uuid, p_subject_profile uuid,
  p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('auth_evidence', p_org, p_cutoff, p_facility, p_subject_profile,
    p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  v_files uuid[];
  n integer;
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  v_files := ARRAY(SELECT a.evidence_file_id FROM itap.authentication_attempts a
                   WHERE a.organization_id = p_org AND a.id = ANY (v_ids));
  UPDATE itap.authentication_attempts a SET evidence_file_id = NULL
  WHERE a.organization_id = p_org AND a.id = ANY (v_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN QUERY SELECT n, v_held, itap.enqueue_unused_files(p_org, v_files, 'retention:auth_evidence');
  PERFORM itap.retention_end(prev);
END;
$$;
