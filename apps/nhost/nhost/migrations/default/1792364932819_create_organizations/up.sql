CREATE TABLE itap.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  legal_name text,
  logo_file_id uuid REFERENCES storage.files (id) ON DELETE SET NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  locale text NOT NULL DEFAULT 'en',
  status text NOT NULL DEFAULT 'active' REFERENCES itap.organization_statuses (value),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX organizations_logo_file_id_idx ON itap.organizations (logo_file_id);
CREATE INDEX organizations_status_idx ON itap.organizations (status);

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON itap.organizations
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
