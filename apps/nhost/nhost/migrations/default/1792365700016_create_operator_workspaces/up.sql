-- Operator workspaces (spec §6.9): a member's saved monitoring layout. User-owned: org_admin sees and manages only
-- rows with user_id = the session user (metadata), user_id is preset from the session. One default per user.
CREATE TABLE itap.operator_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  -- UI layout (panels, positions, camera ids are resolved by the UI); a JSON object.
  layout jsonb NOT NULL DEFAULT '{}',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operator_workspaces_organization_id_user_id_name_key UNIQUE (organization_id, user_id, name),
  CONSTRAINT operator_workspaces_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT operator_workspaces_layout_object CHECK (jsonb_typeof(layout) = 'object'),
  CONSTRAINT operator_workspaces_user_fkey FOREIGN KEY (organization_id, user_id)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE UNIQUE INDEX operator_workspaces_one_default_key ON itap.operator_workspaces (organization_id, user_id)
  WHERE is_default;

CREATE TRIGGER operator_workspaces_set_updated_at BEFORE UPDATE ON itap.operator_workspaces
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.operator_workspaces
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
