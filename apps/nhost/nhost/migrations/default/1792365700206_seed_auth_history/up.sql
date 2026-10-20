-- Slice 9 task 4: the seed's 30 days of face authentication history through the real functions, at simulated instants.
--
-- itap.auth_now(): the instant the auth service functions stamp — now(), or the simulated instant of the seed while
-- the transaction-local setting itap.seed_auth_at is set. Only itap.seed_auth_flow sets it (and clears it before
-- returning, also between its steps); live callers never can (the backend calls these functions with the admin secret
-- and no run_sql), so live behaviour is unchanged: auth_open_session (created_at, expires_at), auth_second_factor
-- (attempted_at, closed_at, event time) and review_authentication_attempt (reviewed_at, session closed_at, event time,
-- audit time) now read itap.auth_now() instead of now(). auth_decide already takes p_at.
--
-- itap.seed_auth_flow(hasura_session, p_flow) (admin-only, seed only): one back-dated session or one review.
--   {kind: 'session', application_id, session_id, mode, claimed_identity_id?, claimed_ref_hash? (default: sha256 of the
--    canonical id), access_point_id?, key_id?, device_ref, ip?, user_agent?, at,
--    steps: [{kind: 'decide', at, embedding?, quality, attack, evidence_file_id?} | {kind: 'second_factor', at, passed,
--    method}]} -> auth_open_session at `at`, then auth_decide(..., p_at = step.at, p_record = true, evidence) /
--    auth_second_factor at step.at; returns the session's attempts.
--   {kind: 'review', session_id, at, approve, note?} -> review_authentication_attempt of the session's pending attempt
--    as the calling member (hasura_session) at `at`; returns the reviewed attempt.
-- Events are emitted with Stage C exactly as live; the seed dates the deliveries with seed_finalize_notifications in
-- the same request.

CREATE FUNCTION itap.auth_now() RETURNS timestamptz
LANGUAGE sql VOLATILE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(nullif(current_setting('itap.seed_auth_at', true), '')::timestamptz, now());
$$;

CREATE OR REPLACE FUNCTION itap.auth_open_session(
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
    device_ref, nonce_hash, expires_at, created_ip, user_agent, created_at
  ) VALUES (
    p_session, p_org, p_app, p_key, p_mode, known, p_claimed_ref_hash, p_access_point, p_device_ref, p_nonce_hash,
    itap.auth_now() + interval '5 minutes', nullif(p_ip, '')::inet, left(p_user_agent, 512), itap.auth_now()
  )
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION itap.auth_second_factor(
  p_org uuid, p_app uuid, p_session uuid, p_passed boolean, p_method text, p_request_id text DEFAULT NULL
)
RETURNS SETOF itap_results.auth_decisions
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  started timestamptz := clock_timestamp();
  v_at timestamptz := itap.auth_now();
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
  -- Verification sessions only: in identification the partially matched candidate is one the client never named, so a
  -- second factor would confirm (or let the app probe) an identity of the population. Refused before any attempt lookup.
  IF sess.mode <> 'verification' THEN
    PERFORM itap.raise_code('auth_second_factor_not_allowed');
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
                       'partial_attempt_id', prev.id)
      || CASE WHEN p_request_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('request_id', left(p_request_id, 64)) END,
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

CREATE OR REPLACE FUNCTION itap.review_authentication_attempt(hasura_session json, p_attempt uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS SETOF itap.authentication_attempts
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.require_active_member(hasura_session);
  current_status text;
  session uuid;
  matched uuid;
  att itap.authentication_attempts;
  sandbox boolean;
  app_name text;
  ap itap.access_points;
  ev itap.events;
  event_id uuid;
  note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF p_approve IS NULL THEN
    PERFORM itap.raise_code('auth_review_decision_required');
  END IF;
  SELECT review_status, session_id, matched_identity_id INTO current_status, session, matched
  FROM itap.authentication_attempts
  WHERE organization_id = org AND id = p_attempt FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('auth_attempt_not_found');
  END IF;
  IF current_status <> 'pending' THEN
    PERFORM itap.raise_code('auth_attempt_not_pending');
  END IF;
  IF matched IS NULL THEN
    PERFORM itap.raise_code('auth_attempt_no_match');
  END IF;
  PERFORM set_config('itap.auth_review_context', 'on', true);
  UPDATE itap.authentication_attempts
  SET review_status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      reviewed_by = actor, reviewed_at = itap.auth_now(), review_note = note
  WHERE organization_id = org AND id = p_attempt;
  PERFORM set_config('itap.auth_review_context', 'off', true);
  IF session IS NOT NULL THEN
    UPDATE itap.authentication_sessions
    SET status = CASE WHEN p_approve THEN 'succeeded' ELSE 'failed' END, closed_at = itap.auth_now()
    WHERE organization_id = org AND id = session AND status IN ('open', 'review');
  END IF;
  -- The review decides the authentication: approval emits auth_success, rejection auth_failed (dedup auth:<attempt>;
  -- a partial match emitted no event before), with Stage C.
  SELECT * INTO att FROM itap.authentication_attempts WHERE organization_id = org AND id = p_attempt;
  SELECT a.name, a.is_sandbox INTO app_name, sandbox FROM itap.client_applications a
  WHERE a.organization_id = org AND a.id = att.application_id;
  IF att.access_point_id IS NOT NULL THEN
    SELECT * INTO ap FROM itap.access_points x WHERE x.organization_id = org AND x.id = att.access_point_id;
  END IF;
  ev.organization_id := org;
  ev.facility_id := ap.facility_id;
  ev.area_id := ap.area_id;
  ev.access_point_id := ap.id;
  ev.identity_id := CASE WHEN p_approve THEN att.matched_identity_id END;
  ev.profile_id := CASE WHEN p_approve THEN att.profile_id END;
  ev.authentication_attempt_id := att.id;
  ev.event_type := CASE WHEN p_approve THEN 'auth_success' ELSE 'auth_failed' END;
  ev.severity := CASE WHEN p_approve THEN 'info' ELSE 'low' END;
  ev.title := CASE WHEN p_approve THEN 'Authentication approved on review: ' ELSE 'Authentication rejected on review: ' END
              || coalesce(app_name, '');
  ev.payload := jsonb_build_object('application_id', att.application_id, 'mode', att.mode, 'session_id', att.session_id,
                                   'review_status', att.review_status, 'reviewed_by', actor, 'confidence', att.confidence,
                                   'threshold', att.threshold_used, 'matched_identity_id', att.matched_identity_id);
  ev.dedup_key := 'auth:' || att.id;
  ev.occurred_at := itap.auth_now();
  -- Sandbox traffic never emits events.
  IF NOT sandbox THEN
    event_id := itap.emit_event(ev);
  END IF;
  IF event_id IS NOT NULL THEN
    PERFORM itap.finish_events(org, ARRAY[event_id]);
  END IF;
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes, reason, occurred_at)
  VALUES (org, actor, CASE WHEN p_approve THEN 'approve' ELSE 'reject' END, 'authentication_attempts', p_attempt,
          jsonb_build_object('review_status', jsonb_build_array('pending', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END),
                             'session_id', session),
          note, itap.auth_now());
  RETURN QUERY SELECT * FROM itap.authentication_attempts WHERE organization_id = org AND id = p_attempt;
END;
$$;

CREATE FUNCTION itap.seed_auth_flow(hasura_session json, p_flow jsonb)
RETURNS SETOF itap.authentication_attempts
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap, public
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  v_kind text := p_flow ->> 'kind';
  v_app uuid := nullif(p_flow ->> 'application_id', '')::uuid;
  v_session uuid := nullif(p_flow ->> 'session_id', '')::uuid;
  v_mode text := p_flow ->> 'mode';
  v_claimed uuid := nullif(p_flow ->> 'claimed_identity_id', '')::uuid;
  v_ap uuid := nullif(p_flow ->> 'access_point_id', '')::uuid;
  v_ref text;
  st jsonb;
  pending uuid;
  d itap.auth_decision;
BEGIN
  IF v_session IS NULL OR nullif(p_flow ->> 'at', '') IS NULL THEN
    PERFORM itap.raise_code('seed_auth_flow_invalid');
  END IF;
  IF v_kind = 'review' THEN
    SELECT a.id INTO pending FROM itap.authentication_attempts a
    WHERE a.organization_id = org AND a.session_id = v_session AND a.review_status = 'pending';
    IF NOT FOUND THEN
      PERFORM itap.raise_code('auth_attempt_not_pending');
    END IF;
    PERFORM set_config('itap.seed_auth_at', p_flow ->> 'at', true);
    RETURN QUERY SELECT * FROM itap.review_authentication_attempt(hasura_session, pending, (p_flow ->> 'approve')::boolean, p_flow ->> 'note');
    PERFORM set_config('itap.seed_auth_at', '', true);
    RETURN;
  END IF;
  IF v_kind IS DISTINCT FROM 'session' THEN
    PERFORM itap.raise_code('seed_auth_flow_invalid');
  END IF;

  v_ref := coalesce(nullif(p_flow ->> 'claimed_ref_hash', ''),
                    CASE WHEN v_claimed IS NOT NULL THEN encode(sha256(convert_to(v_claimed::text, 'UTF8')), 'hex') END);
  PERFORM set_config('itap.seed_auth_at', p_flow ->> 'at', true);
  PERFORM itap.auth_open_session(org, v_app, nullif(p_flow ->> 'key_id', '')::uuid, v_session, v_mode, v_claimed, v_ref, v_ap,
                                 p_flow ->> 'device_ref', encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'),
                                 p_flow ->> 'ip', p_flow ->> 'user_agent');
  FOR st IN SELECT x.value FROM jsonb_array_elements(coalesce(p_flow -> 'steps', '[]')) AS x LOOP
    PERFORM set_config('itap.seed_auth_at', st ->> 'at', true);
    IF st ->> 'kind' = 'decide' THEN
      d := itap.auth_decide(org, v_app, v_session, v_mode, v_claimed, v_ap, nullif(st ->> 'embedding', '')::vector,
                            coalesce(st -> 'quality', '{}'), coalesce(st -> 'attack', '{}'), NULL, (st ->> 'at')::timestamptz,
                            true, nullif(st ->> 'evidence_file_id', '')::uuid);
    ELSIF st ->> 'kind' = 'second_factor' THEN
      PERFORM itap.auth_second_factor(org, v_app, v_session, (st ->> 'passed')::boolean, st ->> 'method', NULL);
    ELSE
      PERFORM itap.raise_code('seed_auth_flow_invalid');
    END IF;
  END LOOP;
  PERFORM set_config('itap.seed_auth_at', '', true);
  RETURN QUERY SELECT * FROM itap.authentication_attempts a
  WHERE a.organization_id = org AND a.session_id = v_session ORDER BY a.attempt_no;
END;
$$;

REVOKE ALL ON FUNCTION itap.seed_auth_flow(json, jsonb) FROM PUBLIC;
