-- Photos of an identity (owned children: CASCADE from the identity; the row goes with its file).
CREATE TABLE itap.identity_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  identity_id uuid NOT NULL,
  file_id uuid NOT NULL REFERENCES storage.files (id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'manual' REFERENCES itap.identity_photo_kinds (value),
  quality_score real,
  captured_at timestamptz,
  -- Capturing device. The FK to devices is added in slice 3 (devices do not exist yet); read-only until then.
  device_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_photos_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT identity_photos_identity_fkey FOREIGN KEY (organization_id, identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX identity_photos_organization_id_identity_id_idx ON itap.identity_photos (organization_id, identity_id);
CREATE INDEX identity_photos_organization_id_file_id_idx ON itap.identity_photos (organization_id, file_id);
CREATE INDEX identity_photos_organization_id_kind_idx ON itap.identity_photos (organization_id, kind);

CREATE TRIGGER identity_photos_set_updated_at BEFORE UPDATE ON itap.identity_photos
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER identity_photos_check_files BEFORE INSERT OR UPDATE OF file_id ON itap.identity_photos
  FOR EACH ROW EXECUTE FUNCTION itap.check_file_bucket('file_id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.identity_photos
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
