-- Identity statuses `verified` and `pending_verification` belong to the verification workflow (spec §6.3):
-- * pending_verification: set when a verification request is created for an unverified identity; a rejected,
--   cancelled or deleted pending request returns the identity to unverified. An identity is pending_verification
--   only while it has a pending request (otherwise the write is turned into unverified, e.g. a merge rollback of a
--   source whose request the merge cancelled).
-- * verified: set by itap.decide_verification (approve_verification).
-- Hasura roles other than admin (org_admin) may set only unverified / suspended / archived: transitions into the
-- reserved statuses are rejected unless the transaction-local flag `itap.verification_context` (set by the
-- functions/triggers below) or `itap.merge_context` (merge/rollback/split) is 'on'. The admin secret, direct SQL
-- and the backend (`actor`, role admin) are not restricted (seed, tests, data fixes).
CREATE FUNCTION itap.identities_verification_status() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  session_role text := nullif(current_setting('hasura.user', true), '')::jsonb ->> 'x-hasura-role';
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status IN ('verified', 'pending_verification')
     AND session_role IS NOT NULL AND session_role <> 'admin'
     AND current_setting('itap.verification_context', true) IS DISTINCT FROM 'on'
     AND current_setting('itap.merge_context', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'identity_status_reserved:' || NEW.status;
  END IF;
  IF NEW.status = 'pending_verification' AND NOT EXISTS (
    SELECT 1 FROM itap.verification_requests r
    WHERE r.organization_id = NEW.organization_id AND r.identity_id = NEW.id AND r.status = 'pending'
  ) THEN
    NEW.status := 'unverified';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER identities_verification_status BEFORE INSERT OR UPDATE OF status ON itap.identities
  FOR EACH ROW EXECUTE FUNCTION itap.identities_verification_status();

-- A pending request moves an unverified identity to pending_verification; leaving `pending` (reject, cancel by a
-- merge) or deleting a pending request moves a pending_verification identity back to unverified. Approval sets
-- `verified` in decide_verification.
CREATE FUNCTION itap.verification_requests_identity_status() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  previous_context text := current_setting('itap.verification_context', true);
BEGIN
  PERFORM set_config('itap.verification_context', 'on', true);
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    UPDATE itap.identities SET status = 'pending_verification'
    WHERE organization_id = NEW.organization_id AND id = NEW.identity_id AND status = 'unverified';
  ELSIF (TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status IN ('rejected', 'cancelled'))
     OR (TG_OP = 'DELETE' AND OLD.status = 'pending') THEN
    UPDATE itap.identities SET status = 'unverified'
    WHERE organization_id = OLD.organization_id AND id = OLD.identity_id AND status = 'pending_verification';
  END IF;
  PERFORM set_config('itap.verification_context', coalesce(previous_context, 'off'), true);
  RETURN NULL;
END;
$$;

CREATE TRIGGER verification_requests_identity_status AFTER INSERT OR UPDATE OF status OR DELETE
  ON itap.verification_requests
  FOR EACH ROW EXECUTE FUNCTION itap.verification_requests_identity_status();

-- decide_verification sets `verified` under the verification flag (body otherwise unchanged).
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
    PERFORM set_config('itap.verification_context', 'off', true);
  END IF;
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes, reason)
  VALUES (org, actor, CASE p_decision WHEN 'approved' THEN 'approve' ELSE 'reject' END, 'verification_requests',
          request.id, jsonb_build_object('identity_id', request.identity_id, 'status', p_decision), p_reason);
  RETURN request;
END;
$$;

-- Existing pending requests: their unverified identities become pending_verification.
SELECT set_config('itap.verification_context', 'on', true);
UPDATE itap.identities i SET status = 'pending_verification'
WHERE i.status = 'unverified' AND EXISTS (
  SELECT 1 FROM itap.verification_requests r
  WHERE r.organization_id = i.organization_id AND r.identity_id = i.id AND r.status = 'pending'
);
SELECT set_config('itap.verification_context', 'off', true);
