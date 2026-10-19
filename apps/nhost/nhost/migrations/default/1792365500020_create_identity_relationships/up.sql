-- Relationships between two identities (spec §6.3), e.g. people who usually move together. Unordered by meaning,
-- stored as an ordered pair (a < b) so each pair exists once. Owned by both identities: CASCADE.
CREATE TABLE itap.identity_relations (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.identity_relations (value, description) VALUES
  ('companion', 'Usually seen together'),
  ('related', 'Related (family, colleague, ...)'),
  ('other', 'Other relationship');

CREATE TABLE itap.identity_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  identity_a_id uuid NOT NULL,
  identity_b_id uuid NOT NULL,
  relation text NOT NULL DEFAULT 'related' REFERENCES itap.identity_relations (value),
  confidence real,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_relationships_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT identity_relationships_pair_key UNIQUE (organization_id, identity_a_id, identity_b_id),
  CONSTRAINT identity_relationships_ordered_pair CHECK (identity_a_id < identity_b_id),
  CONSTRAINT identity_relationships_confidence_range CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  CONSTRAINT identity_relationships_identity_a_fkey FOREIGN KEY (organization_id, identity_a_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT identity_relationships_identity_b_fkey FOREIGN KEY (organization_id, identity_b_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX identity_relationships_organization_id_identity_b_id_idx
  ON itap.identity_relationships (organization_id, identity_b_id);
CREATE INDEX identity_relationships_organization_id_relation_idx ON itap.identity_relationships (organization_id, relation);

CREATE TRIGGER identity_relationships_set_updated_at BEFORE UPDATE ON itap.identity_relationships
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.identity_relationships
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
