CREATE TABLE itap.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'tenant' REFERENCES itap.company_kinds (value),
  contact_email text,
  contact_phone text,
  suite text,
  status text NOT NULL DEFAULT 'active' REFERENCES itap.company_statuses (value),
  cost_center text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Target of composite tenant FKs (profiles.company_id, visits.company_id, ...).
  CONSTRAINT companies_organization_id_id_key UNIQUE (organization_id, id)
);

CREATE INDEX companies_organization_id_name_idx ON itap.companies (organization_id, name);
CREATE INDEX companies_organization_id_kind_idx ON itap.companies (organization_id, kind);
CREATE INDEX companies_organization_id_status_idx ON itap.companies (organization_id, status);

CREATE TRIGGER companies_set_updated_at
  BEFORE UPDATE ON itap.companies
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();

CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.companies
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
