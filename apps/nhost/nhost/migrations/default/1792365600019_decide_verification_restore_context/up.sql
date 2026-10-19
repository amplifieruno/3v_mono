-- decide_verification restores the caller's previous verification_context instead of forcing 'off'.
CREATE OR REPLACE FUNCTION itap.decide_verification(hasura_session json, p_request uuid, p_reason text, p_decision text)
RETURNS itap.verification_requests
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.session_user_id(hasura_session);
  request itap.verification_requests;
  identity_status text;
  previous_context text := current_setting('itap.verification_context', true);
BEGIN
  SELECT * INTO request FROM itap.verification_requests WHERE organization_id = org AND id = p_request FOR UPDATE;
  IF NOT FOUND THEN PERFORM itap.raise_code('verification_not_found'); END IF;
  IF request.status <> 'pending' THEN PERFORM itap.raise_code('verification_not_pending'); END IF;
  SELECT status INTO identity_status FROM itap.identities
  WHERE organization_id = org AND id = request.identity_id FOR UPDATE;
  IF identity_status = 'merged' THEN PERFORM itap.raise_code('identity_already_merged'); END IF;
  IF p_decision = 'approved' AND identity_status IN ('archived', 'suspended') THEN
    PERFORM itap.raise_code('identity_not_verifiable');
  END IF;
  UPDATE itap.verification_requests
  SET status = p_decision, decided_by = itap.organization_member(org, actor), decided_at = now(),
      reason = coalesce(p_reason, reason)
  WHERE id = request.id
  RETURNING * INTO request;
  IF p_decision = 'approved' THEN
    PERFORM set_config('itap.verification_context', 'on', true);
    UPDATE itap.identities SET status = 'verified' WHERE organization_id = org AND id = request.identity_id;
    PERFORM set_config('itap.verification_context', coalesce(previous_context, 'off'), true);
  END IF;
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes, reason)
  VALUES (org, actor, CASE p_decision WHEN 'approved' THEN 'approve' ELSE 'reject' END, 'verification_requests',
          request.id, jsonb_build_object('identity_id', request.identity_id, 'status', p_decision), p_reason);
  RETURN request;
END;
$$;
