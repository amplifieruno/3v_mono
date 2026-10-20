-- Slice 9 task 3: SQL entry points of the backend face authentication service (/v1/auth/*, actions authenticate_face).
-- All admin-only (tracked with roles [] — the backend calls them with the admin secret after key auth / the action
-- checks). The instant is always the database now(): a request never chooses p_at.
--
--   auth_open_session      opens a session (5 minutes): application active, mode allowed, claim rules, access point bound;
--                          claimed_identity_id set only when the (canonical) id exists in the organization.
--   auth_service_decide    auth_decide(..., now(), record) and the PUBLIC projection of its decision + the session state.
--   auth_second_factor     records the application's assertion of a second factor after a partial match (step
--                          second_factor): passed -> success with the partial match's identity, failed -> failure
--                          second_factor_failed; closes the session; auth_success / auth_failed (not for sandbox apps).
--   auth_session_state     session status for polling (review); identity + attributes only once succeeded.
--   expire_auth_sessions   cron sweep: open sessions past expires_at -> expired (review sessions are never touched).
--
-- Public projection (itap_results.auth_decisions): identity, confidence and attributes only for success; a partial
-- match carries neither identity nor score; a failure carries no candidate or score, and its reason is the public one
-- (not_retrieved and not_in_population are reported as below_threshold).

CREATE TABLE itap_results.auth_decisions (
  organization_id uuid NOT NULL,
  attempt_id uuid,
  session_id uuid,
  outcome text NOT NULL,
  matched_identity_id uuid,
  confidence real,
  threshold_used real,
  failure_reason text,
  attack_outcome text NOT NULL,
  attributes jsonb NOT NULL,
  session_status text NOT NULL,
  session_step text NOT NULL,
  step_count integer NOT NULL,
  recapture_count integer NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE itap_results.auth_session_states (
  organization_id uuid NOT NULL,
  session_id uuid NOT NULL,
  application_id uuid NOT NULL,
  mode text NOT NULL,
  status text NOT NULL,
  step text NOT NULL,
  step_count integer NOT NULL,
  recapture_count integer NOT NULL,
  expires_at timestamptz NOT NULL,
  last_outcome text,
  last_failure_reason text,
  review_status text,
  matched_identity_id uuid,
  attributes jsonb NOT NULL
);

CREATE FUNCTION itap.auth_public_failure_reason(p_reason text) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE WHEN p_reason IN ('not_retrieved', 'not_in_population') THEN 'below_threshold' ELSE p_reason END;
$$;

CREATE FUNCTION itap.auth_public_decision(p_org uuid, p_app uuid, d itap.auth_decision, p_session uuid)
RETURNS itap_results.auth_decisions
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  s itap.authentication_sessions;
  r itap_results.auth_decisions;
BEGIN
  SELECT * INTO s FROM itap.authentication_sessions x WHERE x.organization_id = p_org AND x.id = p_session;
  r.organization_id := p_org;
  r.attempt_id := d.attempt_id;
  r.session_id := p_session;
  r.outcome := d.outcome;
  r.threshold_used := d.threshold_used;
  r.attack_outcome := d.attack_outcome;
  r.attributes := '{}';
  IF d.outcome = 'success' THEN
    r.matched_identity_id := d.matched_identity_id;
    r.confidence := d.confidence;
    r.attributes := coalesce(d.attributes, '{}');
  ELSIF d.outcome = 'failure' THEN
    r.failure_reason := itap.auth_public_failure_reason(d.failure_reason);
  END IF;
  r.session_status := s.status;
  r.session_step := s.step;
  r.step_count := s.step_count;
  r.recapture_count := s.recapture_count;
  r.expires_at := s.expires_at;
  RETURN r;
END;
$$;

CREATE FUNCTION itap.auth_open_session(
  p_org uuid,
  p_app uuid,
  p_key uuid,
  p_session uuid,
  p_mode text,
  p_claimed_identity uuid,
  p_claimed_ref_hash text,
  p_access_point uuid,
  p_device_ref text,
  p_nonce_hash text,
  p_ip text,
  p_user_agent text
) RETURNS SETOF itap.authentication_sessions
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  app itap.client_applications;
  known uuid;
BEGIN
  SELECT * INTO app FROM itap.client_applications a WHERE a.organization_id = p_org AND a.id = p_app;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('client_application_not_found');
  END IF;
  IF app.status <> 'active' THEN
    PERFORM itap.raise_code('client_application_inactive');
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('identification', 'verification') THEN
    PERFORM itap.raise_code('auth_mode_invalid');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM itap.client_application_modes m
                 WHERE m.organization_id = p_org AND m.application_id = p_app AND m.mode = p_mode) THEN
    PERFORM itap.raise_code('auth_mode_not_allowed');
  END IF;
  IF p_mode = 'identification' AND (p_claimed_identity IS NOT NULL OR p_claimed_ref_hash IS NOT NULL) THEN
    PERFORM itap.raise_code('auth_claimed_identity_not_allowed');
  END IF;
  IF p_mode = 'verification' AND (p_claimed_identity IS NULL OR p_claimed_ref_hash IS NULL) THEN
    PERFORM itap.raise_code('auth_claimed_identity_required');
  END IF;
  IF p_access_point IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM itap.client_application_access_points b
    WHERE b.organization_id = p_org AND b.application_id = p_app AND b.access_point_id = p_access_point
  ) THEN
    PERFORM itap.raise_code('access_point_not_bound');
  END IF;
  IF p_device_ref IS NULL OR btrim(p_device_ref) = '' OR length(p_device_ref) > 128 THEN
    PERFORM itap.raise_code('auth_device_ref_invalid');
  END IF;
  -- The FK only for an id of this organization (the hash binds the claim either way; no existence oracle here).
  SELECT i.id INTO known FROM itap.identities i WHERE i.organization_id = p_org AND i.id = p_claimed_identity;
  RETURN QUERY
  INSERT INTO itap.authentication_sessions (
    id, organization_id, application_id, key_id, mode, claimed_identity_id, claimed_ref_hash, access_point_id,
    device_ref, nonce_hash, expires_at, created_ip, user_agent
  ) VALUES (
    p_session, p_org, p_app, p_key, p_mode, known, p_claimed_ref_hash, p_access_point, p_device_ref, p_nonce_hash,
    now() + interval '5 minutes', nullif(p_ip, '')::inet, left(p_user_agent, 512)
  )
  RETURNING *;
END;
$$;

CREATE FUNCTION itap.auth_service_decide(
  p_org uuid,
  p_app uuid,
  p_session uuid,
  p_mode text,
  p_claimed_identity uuid,
  p_access_point uuid,
  p_embedding text,
  p_quality jsonb,
  p_attack jsonb,
  p_request_threshold numeric,
  p_evidence_file uuid
) RETURNS SETOF itap_results.auth_decisions
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap, public
AS $$
DECLARE
  d itap.auth_decision;
BEGIN
  IF p_session IS NULL THEN
    PERFORM itap.raise_code('auth_session_required');
  END IF;
  d := itap.auth_decide(p_org, p_app, p_session, p_mode, p_claimed_identity, p_access_point,
                        CASE WHEN p_embedding IS NULL THEN NULL ELSE p_embedding::vector END,
                        p_quality, p_attack, p_request_threshold, now(), true, p_evidence_file);
  RETURN NEXT itap.auth_public_decision(p_org, p_app, d, p_session);
END;
$$;

CREATE FUNCTION itap.auth_second_factor(p_org uuid, p_app uuid, p_session uuid, p_passed boolean, p_method text)
RETURNS SETOF itap_results.auth_decisions
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  started timestamptz := clock_timestamp();
  v_at timestamptz := now();
  app itap.client_applications;
  sess itap.authentication_sessions;
  prev itap.authentication_attempts;
  ap itap.access_points;
  outcome text := CASE WHEN p_passed THEN 'success' ELSE 'failure' END;
  attempt uuid := gen_random_uuid();
  d itap.auth_decision;
  ev itap.events;
  event_id uuid;
BEGIN
  SELECT * INTO app FROM itap.client_applications a WHERE a.organization_id = p_org AND a.id = p_app;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('client_application_not_found');
  END IF;
  IF app.status <> 'active' THEN
    PERFORM itap.raise_code('client_application_inactive');
  END IF;
  SELECT * INTO sess FROM itap.authentication_sessions s
  WHERE s.organization_id = p_org AND s.id = p_session AND s.application_id = p_app FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('auth_session_not_found');
  END IF;
  IF sess.status <> 'open' THEN
    PERFORM itap.raise_code('auth_session_closed');
  END IF;
  IF sess.expires_at <= v_at THEN
    PERFORM itap.raise_code('auth_session_expired');
  END IF;
  IF p_passed IS NULL OR p_method IS NULL OR btrim(p_method) = '' OR length(p_method) > 64 THEN
    PERFORM itap.raise_code('auth_second_factor_invalid');
  END IF;
  SELECT * INTO prev FROM itap.authentication_attempts t
  WHERE t.organization_id = p_org AND t.session_id = p_session ORDER BY t.attempt_no DESC LIMIT 1;
  IF NOT FOUND OR prev.outcome <> 'partial_match' OR prev.matched_identity_id IS NULL THEN
    PERFORM itap.raise_code('auth_second_factor_not_allowed');
  END IF;

  INSERT INTO itap.authentication_attempts (
    id, organization_id, application_id, session_id, attempt_no, step, mode, claimed_identity_id, matched_identity_id,
    profile_id, access_point_id, device_ref, outcome, confidence, threshold_used, population_size, population_scope,
    retrieval_candidates, retrieval_hit, comparison_score, failure_reason, attack_outcome, attack_details, quality,
    model_version, latency_ms, ip, user_agent, attempted_at
  ) VALUES (
    attempt, p_org, p_app, p_session, sess.step_count + 1, 'second_factor', prev.mode, prev.claimed_identity_id,
    CASE WHEN p_passed THEN prev.matched_identity_id END, CASE WHEN p_passed THEN prev.profile_id END,
    prev.access_point_id, sess.device_ref, outcome, prev.confidence, prev.threshold_used, prev.population_size,
    prev.population_scope, prev.retrieval_candidates, prev.retrieval_hit, prev.comparison_score,
    CASE WHEN NOT p_passed THEN 'second_factor_failed' END, prev.attack_outcome,
    jsonb_build_object('second_factor', jsonb_build_object('method', btrim(p_method), 'result',
                       CASE WHEN p_passed THEN 'passed' ELSE 'failed' END, 'asserted_by', 'application'),
                       'partial_attempt_id', prev.id),
    '{}', prev.model_version, round(extract(epoch FROM clock_timestamp() - started) * 1000),
    sess.created_ip, sess.user_agent, v_at
  );
  UPDATE itap.authentication_sessions
  SET step_count = step_count + 1, step = 'second_factor',
      status = CASE WHEN p_passed THEN 'succeeded' ELSE 'failed' END, closed_at = v_at
  WHERE organization_id = p_org AND id = p_session;

  d.attempt_id := attempt;
  d.outcome := outcome;
  d.threshold_used := prev.threshold_used;
  d.attack_outcome := prev.attack_outcome;
  d.population_size := prev.population_size;
  d.attributes := '{}';
  IF p_passed THEN
    d.matched_identity_id := prev.matched_identity_id;
    d.confidence := prev.confidence;
    d.attributes := itap.auth_attributes(p_app, prev.matched_identity_id, v_at);
  ELSE
    d.failure_reason := 'second_factor_failed';
  END IF;

  -- Sandbox traffic never emits events (like auth_decide).
  IF NOT app.is_sandbox THEN
    IF prev.access_point_id IS NOT NULL THEN
      SELECT * INTO ap FROM itap.access_points x WHERE x.organization_id = p_org AND x.id = prev.access_point_id;
    END IF;
    ev.organization_id := p_org;
    ev.facility_id := ap.facility_id;
    ev.area_id := ap.area_id;
    ev.access_point_id := ap.id;
    ev.identity_id := CASE WHEN p_passed THEN prev.matched_identity_id END;
    ev.profile_id := CASE WHEN p_passed THEN prev.profile_id END;
    ev.authentication_attempt_id := attempt;
    ev.event_type := CASE WHEN p_passed THEN 'auth_success' ELSE 'auth_failed' END;
    ev.severity := CASE WHEN p_passed THEN 'info' ELSE 'low' END;
    ev.title := CASE WHEN p_passed THEN 'Authentication succeeded: ' ELSE 'Authentication failed: ' END || app.name;
    ev.payload := jsonb_build_object('application_id', app.id, 'mode', prev.mode, 'session_id', p_session,
                                     'step', 'second_factor', 'method', btrim(p_method),
                                     'failure_reason', CASE WHEN NOT p_passed THEN 'second_factor_failed' END,
                                     'attack_outcome', prev.attack_outcome, 'confidence', prev.confidence,
                                     'threshold', prev.threshold_used, 'claimed_identity_id', prev.claimed_identity_id);
    ev.dedup_key := 'auth:' || attempt;
    ev.occurred_at := v_at;
    event_id := itap.emit_event(ev);
    IF event_id IS NOT NULL THEN
      PERFORM itap.finish_events(p_org, ARRAY[event_id]);
    END IF;
  END IF;
  RETURN NEXT itap.auth_public_decision(p_org, p_app, d, p_session);
END;
$$;

CREATE FUNCTION itap.auth_session_state(p_org uuid, p_app uuid, p_session uuid)
RETURNS SETOF itap_results.auth_session_states
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  s itap.authentication_sessions;
  last itap.authentication_attempts;
  won itap.authentication_attempts;
  r itap_results.auth_session_states;
BEGIN
  SELECT * INTO s FROM itap.authentication_sessions x
  WHERE x.organization_id = p_org AND x.id = p_session AND x.application_id = p_app;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT * INTO last FROM itap.authentication_attempts t
  WHERE t.organization_id = p_org AND t.session_id = p_session ORDER BY t.attempt_no DESC LIMIT 1;
  r.organization_id := p_org;
  r.session_id := s.id;
  r.application_id := s.application_id;
  r.mode := s.mode;
  -- An open session past its expiry is reported expired (the expire_auth_sessions sweep writes it within a minute).
  r.status := CASE WHEN s.status = 'open' AND s.expires_at <= now() THEN 'expired' ELSE s.status END;
  r.step := s.step;
  r.step_count := s.step_count;
  r.recapture_count := s.recapture_count;
  r.expires_at := s.expires_at;
  r.last_outcome := last.outcome;
  r.last_failure_reason := CASE WHEN last.outcome = 'failure' THEN itap.auth_public_failure_reason(last.failure_reason) END;
  r.review_status := last.review_status;
  r.attributes := '{}';
  IF s.status = 'succeeded' THEN
    SELECT * INTO won FROM itap.authentication_attempts t
    WHERE t.organization_id = p_org AND t.session_id = p_session AND t.matched_identity_id IS NOT NULL
      AND (t.outcome = 'success' OR t.review_status = 'approved')
    ORDER BY t.attempt_no DESC LIMIT 1;
    IF FOUND THEN
      r.matched_identity_id := won.matched_identity_id;
      r.attributes := itap.auth_attributes(p_app, won.matched_identity_id, now());
    END IF;
  END IF;
  RETURN NEXT r;
END;
$$;

CREATE FUNCTION itap.expire_auth_sessions(p_organization uuid, p_at timestamptz)
RETURNS SETOF itap.authentication_sessions
LANGUAGE sql VOLATILE
SET search_path = pg_catalog, itap
AS $$
  UPDATE itap.authentication_sessions
  SET status = 'expired', closed_at = coalesce(p_at, now())
  WHERE organization_id = p_organization AND status = 'open' AND expires_at <= coalesce(p_at, now())
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION itap.auth_public_failure_reason(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION itap.auth_public_decision(uuid, uuid, itap.auth_decision, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION itap.auth_open_session(uuid, uuid, uuid, uuid, text, uuid, text, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION itap.auth_service_decide(uuid, uuid, uuid, text, uuid, uuid, text, jsonb, jsonb, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION itap.auth_second_factor(uuid, uuid, uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION itap.auth_session_state(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION itap.expire_auth_sessions(uuid, timestamptz) FROM PUBLIC;
