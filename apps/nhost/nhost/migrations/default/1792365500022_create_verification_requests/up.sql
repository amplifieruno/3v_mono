-- Single-stage identity verification queue (spec §6.3). Decided only by itap.approve_verification /
-- itap.reject_verification (status, decided_by, decided_at are read-only in metadata). requested_by is stamped from
-- the Hasura session user when that user is a member of the organization.
CREATE TABLE itap.verification_statuses (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.verification_statuses (value, description) VALUES
  ('pending', 'Waiting for a decision'),
  ('approved', 'Approved: identity verified'),
  ('rejected', 'Rejected'),
  ('cancelled', 'Cancelled');

CREATE TABLE itap.verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  identity_id uuid NOT NULL,
  requested_by uuid,
  assigned_to uuid,
  status text NOT NULL DEFAULT 'pending' REFERENCES itap.verification_statuses (value),
  decided_by uuid,
  decided_at timestamptz,
  reason text,
  evidence jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verification_requests_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT verification_requests_evidence_object CHECK (jsonb_typeof(evidence) = 'object'),
  -- Owned workflow rows of the identity.
  CONSTRAINT verification_requests_identity_fkey FOREIGN KEY (organization_id, identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT verification_requests_requested_by_fkey FOREIGN KEY (organization_id, requested_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT verification_requests_assigned_to_fkey FOREIGN KEY (organization_id, assigned_to)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT verification_requests_decided_by_fkey FOREIGN KEY (organization_id, decided_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);

CREATE INDEX verification_requests_organization_id_identity_id_idx ON itap.verification_requests (organization_id, identity_id);
CREATE INDEX verification_requests_organization_id_requested_by_idx ON itap.verification_requests (organization_id, requested_by);
CREATE INDEX verification_requests_organization_id_assigned_to_idx ON itap.verification_requests (organization_id, assigned_to);
CREATE INDEX verification_requests_organization_id_decided_by_idx ON itap.verification_requests (organization_id, decided_by);
CREATE INDEX verification_requests_organization_id_status_idx ON itap.verification_requests (organization_id, status);
-- At most one open request per identity.
CREATE UNIQUE INDEX verification_requests_one_pending_key ON itap.verification_requests (organization_id, identity_id)
  WHERE status = 'pending';

CREATE FUNCTION itap.verification_requests_stamp_requester() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  session_user_id text := nullif(current_setting('hasura.user', true), '')::jsonb ->> 'x-hasura-user-id';
BEGIN
  IF NEW.requested_by IS NULL THEN
    SELECT m.user_id INTO NEW.requested_by
    FROM itap.organization_members m
    WHERE m.organization_id = NEW.organization_id
      AND session_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND m.user_id = session_user_id::uuid;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER verification_requests_stamp_requester BEFORE INSERT ON itap.verification_requests
  FOR EACH ROW EXECUTE FUNCTION itap.verification_requests_stamp_requester();
CREATE TRIGGER verification_requests_set_updated_at BEFORE UPDATE ON itap.verification_requests
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER verification_requests_active_member_check BEFORE INSERT OR UPDATE OF assigned_to ON itap.verification_requests
  FOR EACH ROW EXECUTE FUNCTION itap.active_member_check('assigned_to');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.verification_requests
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
