-- Slice 9 task 3 fix round 1 (ledger rulings):
--   * second factor only on verification sessions (identification: partial -> recapture -> review);
--   * the client request id is stored on the attempt (attack_details.request_id; auth_decide receives it the same way);
--   * client key secrets are encrypted with the key prefix as AES-GCM additional data (format v2); v1 rows (none existed:
--     dev keys are test fixtures) cannot be decrypted any more and must be rotated.
ALTER TABLE itap.client_application_keys DROP CONSTRAINT client_application_keys_secret_format;
ALTER TABLE itap.client_application_keys
  ADD CONSTRAINT client_application_keys_secret_format
  CHECK (secret IS NULL OR secret ~ '^v[12]:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$');

DROP FUNCTION itap.auth_second_factor(uuid, uuid, uuid, boolean, text);
CREATE FUNCTION itap.auth_second_factor(
  p_org uuid, p_app uuid, p_session uuid, p_passed boolean, p_method text, p_request_id text DEFAULT NULL
)
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

REVOKE ALL ON FUNCTION itap.auth_second_factor(uuid, uuid, uuid, boolean, text, text) FROM PUBLIC;
