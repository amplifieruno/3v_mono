-- Physical sites (spec §6.6). Lifecycle by status (spec §6.0): a facility with areas (or, from task 2, devices) cannot
-- be deleted (NO ACTION FKs); archive it with status 'inactive'.
CREATE TABLE itap.facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  number bigint NOT NULL,
  code text GENERATED ALWAYS AS ('FACILITY-' || lpad(number::text, 5, '0')) STORED,
  name text NOT NULL,
  description text,
  address text,
  latitude numeric,
  longitude numeric,
  timezone text NOT NULL DEFAULT 'UTC',
  status text NOT NULL DEFAULT 'active' REFERENCES itap.facility_statuses (value),
  -- Wall-clock windows in the facility timezone, evaluated by itap.in_windows.
  operating_hours jsonb NOT NULL DEFAULT '[]',
  -- Free-form contact details (phone, email, person); a JSON object.
  contact jsonb NOT NULL DEFAULT '{}',
  custom_fields jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facilities_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT facilities_organization_id_number_key UNIQUE (organization_id, number),
  CONSTRAINT facilities_organization_id_code_key UNIQUE (organization_id, code),
  CONSTRAINT facilities_organization_id_name_key UNIQUE (organization_id, name),
  CONSTRAINT facilities_latitude_range CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT facilities_longitude_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  CONSTRAINT facilities_timezone_valid CHECK (itap.is_valid_timezone(timezone)),
  CONSTRAINT facilities_operating_hours_valid CHECK (itap.valid_windows(operating_hours)),
  CONSTRAINT facilities_contact_is_object CHECK (jsonb_typeof(contact) = 'object')
);

CREATE INDEX facilities_organization_id_status_idx ON itap.facilities (organization_id, status);

CREATE TRIGGER facilities_number BEFORE INSERT ON itap.facilities
  FOR EACH ROW EXECUTE FUNCTION itap.assign_number('facility');
CREATE TRIGGER facilities_set_updated_at BEFORE UPDATE ON itap.facilities
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER facilities_validate_custom_fields BEFORE INSERT OR UPDATE ON itap.facilities
  FOR EACH ROW EXECUTE FUNCTION itap.validate_custom_fields('facility');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.facilities
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
