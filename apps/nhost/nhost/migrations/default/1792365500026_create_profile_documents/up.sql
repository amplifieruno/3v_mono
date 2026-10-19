-- Documents attached to a profile (spec §6.4): id cards, contracts, NDAs. The file lives in the organization bucket
-- with metadata.kind = 'profile_document' (org_admin cannot select or upload such files directly; they are written
-- by the upload_profile_document action and opened through open_file, which audits the access).
CREATE TABLE itap.profile_document_kinds (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.profile_document_kinds (value, description) VALUES
  ('id_card', 'Identity card or passport'),
  ('contract', 'Employment or service contract'),
  ('nda', 'Non-disclosure agreement'),
  ('badge_photo', 'Badge photo'),
  ('other', 'Other document');

CREATE TABLE itap.profile_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  -- The row goes with its file (delete_file removes both).
  file_id uuid NOT NULL REFERENCES storage.files (id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'other' REFERENCES itap.profile_document_kinds (value),
  title text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  valid_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_documents_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT profile_documents_version_positive CHECK (version >= 1),
  CONSTRAINT profile_documents_profile_fkey FOREIGN KEY (organization_id, profile_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX profile_documents_organization_id_profile_id_idx ON itap.profile_documents (organization_id, profile_id);
CREATE INDEX profile_documents_organization_id_file_id_idx ON itap.profile_documents (organization_id, file_id);
CREATE INDEX profile_documents_organization_id_kind_idx ON itap.profile_documents (organization_id, kind);

CREATE TRIGGER profile_documents_set_updated_at BEFORE UPDATE ON itap.profile_documents
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER profile_documents_check_files BEFORE INSERT OR UPDATE OF file_id ON itap.profile_documents
  FOR EACH ROW EXECUTE FUNCTION itap.check_file_bucket('file_id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.profile_documents
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
