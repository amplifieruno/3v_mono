-- Previous definition (1792365700195_auth_review_and_session_guards).
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
