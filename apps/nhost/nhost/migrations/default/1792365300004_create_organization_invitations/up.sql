-- Invitations to join an organization. Created only by the invite_member action; the plaintext token is
-- never stored (sha256 hex in token_hash, redacted in the audit log).
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE itap.invitation_statuses (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.invitation_statuses (value, description) VALUES
  ('pending', 'Waiting for the invitee'),
  ('accepted', 'Accepted'),
  ('revoked', 'Revoked by an administrator'),
  ('expired', 'Expired before acceptance');

CREATE TABLE itap.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  email citext NOT NULL,
  role text NOT NULL DEFAULT 'admin' REFERENCES itap.member_roles (value),
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' REFERENCES itap.invitation_statuses (value),
  expires_at timestamptz NOT NULL,
  invited_by uuid NOT NULL,
  accepted_by uuid REFERENCES auth.users (id) ON DELETE NO ACTION,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- NO ACTION (not RESTRICT): checked at statement end, so an organization cascade completes.
  CONSTRAINT organization_invitations_invited_by_fkey
    FOREIGN KEY (organization_id, invited_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);

CREATE UNIQUE INDEX organization_invitations_token_hash_key ON itap.organization_invitations (token_hash);
CREATE UNIQUE INDEX organization_invitations_pending_email_key
  ON itap.organization_invitations (organization_id, email) WHERE status = 'pending';
CREATE INDEX organization_invitations_invited_by_idx ON itap.organization_invitations (organization_id, invited_by);
CREATE INDEX organization_invitations_accepted_by_idx ON itap.organization_invitations (accepted_by);

CREATE TRIGGER organization_invitations_set_updated_at
  BEFORE UPDATE ON itap.organization_invitations
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();

CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.organization_invitations
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change('token_hash');
