-- windows shape: see itap.in_windows. Only "is a JSON array" is enforced at write time; entries are interpreted leniently.
CREATE TABLE itap.work_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  windows jsonb NOT NULL DEFAULT '[]',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_schedules_windows_is_array CHECK (jsonb_typeof(windows) = 'array'),
  CONSTRAINT work_schedules_timezone_valid CHECK (itap.is_valid_timezone(timezone)),
  CONSTRAINT work_schedules_organization_id_id_key UNIQUE (organization_id, id)
);

CREATE INDEX work_schedules_organization_id_name_idx ON itap.work_schedules (organization_id, name);

CREATE TRIGGER work_schedules_set_updated_at
  BEFORE UPDATE ON itap.work_schedules
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();

CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.work_schedules
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
