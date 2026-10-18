CREATE TABLE itap.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  -- Users are never deleted (disabled/anonymized instead), §4.2.
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE NO ACTION,
  role text NOT NULL DEFAULT 'admin' REFERENCES itap.member_roles (value),
  status text NOT NULL DEFAULT 'active' REFERENCES itap.member_statuses (value),
  title text,
  department text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  deactivated_at timestamptz,
  deactivated_by uuid,
  quiet_hours jsonb,
  vacation_until timestamptz,
  vacation_delegate_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_members_organization_id_user_id_key UNIQUE (organization_id, user_id),
  -- NO ACTION (not RESTRICT): checked at statement end, so an organization cascade completes.
  CONSTRAINT organization_members_deactivated_by_fkey
    FOREIGN KEY (organization_id, deactivated_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT organization_members_vacation_delegate_user_id_fkey
    FOREIGN KEY (organization_id, vacation_delegate_user_id)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT organization_members_deactivated_at_check
    CHECK (status <> 'deactivated' OR deactivated_at IS NOT NULL)
);

CREATE INDEX organization_members_user_id_idx ON itap.organization_members (user_id);
CREATE INDEX organization_members_role_idx ON itap.organization_members (organization_id, role);
CREATE INDEX organization_members_status_idx ON itap.organization_members (organization_id, status);
CREATE INDEX organization_members_deactivated_by_idx
  ON itap.organization_members (organization_id, deactivated_by);
CREATE INDEX organization_members_vacation_delegate_user_id_idx
  ON itap.organization_members (organization_id, vacation_delegate_user_id);

CREATE TRIGGER organization_members_set_updated_at
  BEFORE UPDATE ON itap.organization_members
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
