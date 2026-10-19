-- Possible duplicate identities found by the system (review queue, spec §6.3). Ordered pair, one row per pair.
-- Written by the system; org_admin may only change the status (dismiss); merge_identities closes pairs as merged.
CREATE TABLE itap.candidate_statuses (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.candidate_statuses (value, description) VALUES
  ('open', 'Waiting for review'),
  ('merged', 'Merged'),
  ('dismissed', 'Not a duplicate');

CREATE TABLE itap.identity_duplicate_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  identity_a_id uuid NOT NULL,
  identity_b_id uuid NOT NULL,
  -- Cosine similarity of the closest templates (1 - distance).
  similarity real NOT NULL,
  status text NOT NULL DEFAULT 'open' REFERENCES itap.candidate_statuses (value),
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_duplicate_candidates_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT identity_duplicate_candidates_pair_key UNIQUE (organization_id, identity_a_id, identity_b_id),
  CONSTRAINT identity_duplicate_candidates_ordered_pair CHECK (identity_a_id < identity_b_id),
  CONSTRAINT identity_duplicate_candidates_similarity_range CHECK (similarity BETWEEN -1 AND 1),
  CONSTRAINT identity_duplicate_candidates_identity_a_fkey FOREIGN KEY (organization_id, identity_a_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT identity_duplicate_candidates_identity_b_fkey FOREIGN KEY (organization_id, identity_b_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX identity_duplicate_candidates_organization_id_identity_b_id_idx
  ON itap.identity_duplicate_candidates (organization_id, identity_b_id);
CREATE INDEX identity_duplicate_candidates_organization_id_status_idx
  ON itap.identity_duplicate_candidates (organization_id, status);

CREATE TRIGGER identity_duplicate_candidates_set_updated_at BEFORE UPDATE ON itap.identity_duplicate_candidates
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.identity_duplicate_candidates
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
