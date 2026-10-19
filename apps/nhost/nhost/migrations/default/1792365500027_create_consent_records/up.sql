-- Consent records (spec §6.4). One row per consent decision; a grant may later be withdrawn (status 'withdrawn',
-- withdrawn_at) or superseded by a newer record. Effects of biometric_processing: next migration.
CREATE TABLE itap.consent_purposes (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.consent_purposes (value, description) VALUES
  ('biometric_processing', 'Face recognition and storage of biometric templates'),
  ('tracking', 'Movement tracking'),
  ('analytics', 'Analytics and reporting'),
  ('marketing', 'Marketing communication');

CREATE TABLE itap.consent_statuses (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.consent_statuses (value, description) VALUES
  ('granted', 'Consent given'),
  ('withdrawn', 'Consent withdrawn');

CREATE TABLE itap.consent_methods (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.consent_methods (value, description) VALUES
  ('paper', 'Signed paper form'),
  ('electronic', 'Electronic form'),
  ('verbal', 'Verbal, recorded by an operator');

CREATE TABLE itap.consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  purpose text NOT NULL REFERENCES itap.consent_purposes (value),
  status text NOT NULL DEFAULT 'granted' REFERENCES itap.consent_statuses (value),
  granted_at timestamptz NOT NULL DEFAULT now(),
  -- Defaults to now() for a withdrawn record without one (BEFORE trigger).
  withdrawn_at timestamptz,
  method text NOT NULL DEFAULT 'electronic' REFERENCES itap.consent_methods (value),
  document_file_id uuid REFERENCES storage.files (id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consent_records_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT consent_records_withdrawn_at_matches_status CHECK ((status = 'withdrawn') = (withdrawn_at IS NOT NULL)),
  CONSTRAINT consent_records_profile_fkey FOREIGN KEY (organization_id, profile_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX consent_records_organization_id_profile_id_purpose_idx
  ON itap.consent_records (organization_id, profile_id, purpose);
CREATE INDEX consent_records_organization_id_purpose_idx ON itap.consent_records (organization_id, purpose);
CREATE INDEX consent_records_organization_id_status_idx ON itap.consent_records (organization_id, status);
CREATE INDEX consent_records_organization_id_method_idx ON itap.consent_records (organization_id, method);
CREATE INDEX consent_records_organization_id_document_file_id_idx
  ON itap.consent_records (organization_id, document_file_id);

CREATE FUNCTION itap.consent_records_defaults() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF NEW.status = 'withdrawn' AND NEW.withdrawn_at IS NULL THEN
    NEW.withdrawn_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER consent_records_defaults BEFORE INSERT OR UPDATE ON itap.consent_records
  FOR EACH ROW EXECUTE FUNCTION itap.consent_records_defaults();
CREATE TRIGGER consent_records_set_updated_at BEFORE UPDATE ON itap.consent_records
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER consent_records_check_files BEFORE INSERT OR UPDATE OF document_file_id ON itap.consent_records
  FOR EACH ROW EXECUTE FUNCTION itap.check_file_bucket('document_file_id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.consent_records
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
