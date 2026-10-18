-- Cross-organization personal preferences, 1:1 with auth.users (§4.2).
CREATE TABLE itap.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE NO ACTION,
  locale text,
  timezone text,
  last_organization_id uuid REFERENCES itap.organizations (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_settings_last_organization_id_idx ON itap.user_settings (last_organization_id);

CREATE TRIGGER user_settings_set_updated_at
  BEFORE UPDATE ON itap.user_settings
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
