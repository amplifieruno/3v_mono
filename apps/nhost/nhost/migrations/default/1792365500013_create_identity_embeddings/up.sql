-- Face embeddings of an identity (owned children: CASCADE). Not audited (biometric vectors, system-written).
-- Stored vectors are never overwritten (fixes template drift, §7); is_template is maintained by
-- itap.refresh_templates (migration *_create_template_upkeep).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE itap.identity_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  identity_id uuid NOT NULL,
  embedding vector(512) NOT NULL,
  quality_score real,
  model_version text,
  -- Detection that produced the embedding: a log link without FK (detections are partitioned/retained separately).
  source_detection_id uuid,
  photo_file_id uuid REFERENCES storage.files (id) ON DELETE SET NULL,
  is_template boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_embeddings_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT identity_embeddings_identity_fkey FOREIGN KEY (organization_id, identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX identity_embeddings_organization_id_identity_id_idx
  ON itap.identity_embeddings (organization_id, identity_id);
CREATE INDEX identity_embeddings_organization_id_photo_file_id_idx
  ON itap.identity_embeddings (organization_id, photo_file_id);
-- Matching scans templates of one organization (exact scan, no ANN index: §7).
CREATE INDEX identity_embeddings_templates_idx
  ON itap.identity_embeddings (organization_id, identity_id) WHERE is_template;

CREATE FUNCTION itap.identity_embeddings_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'embedding_immutable';
END;
$$;

CREATE TRIGGER identity_embeddings_immutable BEFORE UPDATE OF embedding ON itap.identity_embeddings
  FOR EACH ROW WHEN (OLD.embedding IS DISTINCT FROM NEW.embedding)
  EXECUTE FUNCTION itap.identity_embeddings_immutable();
CREATE TRIGGER identity_embeddings_set_updated_at BEFORE UPDATE ON itap.identity_embeddings
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER identity_embeddings_check_files BEFORE INSERT OR UPDATE OF photo_file_id ON itap.identity_embeddings
  FOR EACH ROW EXECUTE FUNCTION itap.check_file_bucket('photo_file_id');
