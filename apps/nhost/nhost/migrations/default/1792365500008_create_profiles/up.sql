CREATE TABLE itap.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  number bigint NOT NULL,
  code text GENERATED ALWAYS AS ('PROFILE-' || lpad(number::text, 5, '0')) STORED,
  profile_type text NOT NULL DEFAULT 'employee' REFERENCES itap.profile_types (value),
  status text NOT NULL DEFAULT 'active' REFERENCES itap.profile_statuses (value),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  employee_id text,
  company_id uuid,
  department text,
  job_title text,
  access_level text NOT NULL DEFAULT 'basic' REFERENCES itap.access_levels (value),
  start_date date,
  end_date date,
  work_schedule_id uuid,
  avatar_file_id uuid REFERENCES storage.files (id) ON DELETE SET NULL,
  notes text,
  custom_fields jsonb NOT NULL DEFAULT '{}',
  -- Origin in an external system. The FK to integrations is added in slice 10 (integrations do not exist yet).
  source_integration_id uuid,
  external_id text,
  -- Maintained by triggers on identities (slice 2, task 3); read-only for clients.
  identities_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT profiles_organization_id_number_key UNIQUE (organization_id, number),
  CONSTRAINT profiles_organization_id_code_key UNIQUE (organization_id, code),
  CONSTRAINT profiles_company_fkey FOREIGN KEY (organization_id, company_id)
    REFERENCES itap.companies (organization_id, id),
  CONSTRAINT profiles_work_schedule_fkey FOREIGN KEY (organization_id, work_schedule_id)
    REFERENCES itap.work_schedules (organization_id, id),
  CONSTRAINT profiles_dates_ordered CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
  CONSTRAINT profiles_identities_count_nonnegative CHECK (identities_count >= 0)
);

CREATE INDEX profiles_organization_id_last_name_first_name_idx ON itap.profiles (organization_id, last_name, first_name);
CREATE INDEX profiles_organization_id_status_idx ON itap.profiles (organization_id, status);
CREATE INDEX profiles_organization_id_profile_type_idx ON itap.profiles (organization_id, profile_type);
CREATE INDEX profiles_organization_id_email_idx ON itap.profiles (organization_id, email);
CREATE INDEX profiles_organization_id_employee_id_idx ON itap.profiles (organization_id, employee_id);
CREATE INDEX profiles_organization_id_company_id_idx ON itap.profiles (organization_id, company_id);
CREATE INDEX profiles_organization_id_work_schedule_id_idx ON itap.profiles (organization_id, work_schedule_id);
CREATE INDEX profiles_organization_id_access_level_idx ON itap.profiles (organization_id, access_level);
CREATE INDEX profiles_organization_id_avatar_file_id_idx ON itap.profiles (organization_id, avatar_file_id);

CREATE TRIGGER profiles_number BEFORE INSERT ON itap.profiles
  FOR EACH ROW EXECUTE FUNCTION itap.assign_number('profile');
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON itap.profiles
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER profiles_check_files BEFORE INSERT OR UPDATE OF avatar_file_id ON itap.profiles
  FOR EACH ROW EXECUTE FUNCTION itap.check_file_bucket('avatar_file_id');
CREATE TRIGGER profiles_validate_custom_fields BEFORE INSERT OR UPDATE ON itap.profiles
  FOR EACH ROW EXECUTE FUNCTION itap.validate_custom_fields('profile');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.profiles
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

-- Computed field `has_face`: the FS "pending link" state is has_face = false.
CREATE FUNCTION itap.profile_has_face(profile_row itap.profiles) RETURNS boolean
  LANGUAGE sql STABLE
AS $$
  SELECT profile_row.identities_count > 0;
$$;
