-- Identity merges (spec §6.3): a merge record, its sources (kept with status `merged`) and an exact undo log of the
-- rows moved to the target. Written only by itap.merge_identities / itap.rollback_merge (read-only in metadata);
-- the functions write explicit `merge` / `rollback` audit rows, so these tables carry no row audit trigger.
CREATE TABLE itap.merge_statuses (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.merge_statuses (value, description) VALUES
  ('completed', 'Merged'),
  ('rolled_back', 'Rolled back');

CREATE TABLE itap.identity_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  target_identity_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'completed' REFERENCES itap.merge_statuses (value),
  reason text,
  -- Profile the target inherited from a source (it had none); rollback unlinks it again.
  inherited_profile_id uuid,
  -- The target took over the primary flag of a source (that source was primary for the profile); rollback clears it.
  inherited_primary boolean NOT NULL DEFAULT false,
  merged_by uuid,
  rolled_back_by uuid,
  rolled_back_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_merges_organization_id_id_key UNIQUE (organization_id, id),
  -- History points at identities: NO ACTION (a merged identity is kept, not deleted).
  CONSTRAINT identity_merges_target_identity_fkey FOREIGN KEY (organization_id, target_identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT identity_merges_inherited_profile_fkey FOREIGN KEY (organization_id, inherited_profile_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE SET NULL (inherited_profile_id),
  CONSTRAINT identity_merges_merged_by_fkey FOREIGN KEY (organization_id, merged_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT identity_merges_rolled_back_by_fkey FOREIGN KEY (organization_id, rolled_back_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);

CREATE INDEX identity_merges_organization_id_target_identity_id_idx ON itap.identity_merges (organization_id, target_identity_id);
CREATE INDEX identity_merges_organization_id_inherited_profile_id_idx ON itap.identity_merges (organization_id, inherited_profile_id);
CREATE INDEX identity_merges_organization_id_merged_by_idx ON itap.identity_merges (organization_id, merged_by);
CREATE INDEX identity_merges_organization_id_rolled_back_by_idx ON itap.identity_merges (organization_id, rolled_back_by);
CREATE INDEX identity_merges_organization_id_status_idx ON itap.identity_merges (organization_id, status);

CREATE TRIGGER identity_merges_set_updated_at BEFORE UPDATE ON itap.identity_merges
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();

-- Sources of a merge with the state rollback restores (append-only).
CREATE TABLE itap.identity_merge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  merge_id uuid NOT NULL,
  source_identity_id uuid NOT NULL,
  previous_status text NOT NULL REFERENCES itap.identity_statuses (value),
  previous_profile_id uuid,
  previous_is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_merge_sources_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT identity_merge_sources_merge_source_key UNIQUE (organization_id, merge_id, source_identity_id),
  CONSTRAINT identity_merge_sources_merge_fkey FOREIGN KEY (organization_id, merge_id)
    REFERENCES itap.identity_merges (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT identity_merge_sources_source_identity_fkey FOREIGN KEY (organization_id, source_identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT identity_merge_sources_previous_profile_fkey FOREIGN KEY (organization_id, previous_profile_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE SET NULL (previous_profile_id)
);

CREATE INDEX identity_merge_sources_organization_id_source_identity_id_idx
  ON itap.identity_merge_sources (organization_id, source_identity_id);
CREATE INDEX identity_merge_sources_organization_id_previous_profile_id_idx
  ON itap.identity_merge_sources (organization_id, previous_profile_id);
CREATE INDEX identity_merge_sources_organization_id_previous_status_idx
  ON itap.identity_merge_sources (organization_id, previous_status);

-- Undo log: every row a merge moved to the target (spec §6.0 JSON/id exception: entity + row_id, read and written
-- only by the merge functions). Append-only.
CREATE TABLE itap.identity_merge_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  merge_id uuid NOT NULL,
  entity text NOT NULL,
  row_id uuid NOT NULL,
  from_identity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_merge_moves_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT identity_merge_moves_row_key UNIQUE (organization_id, merge_id, entity, row_id),
  CONSTRAINT identity_merge_moves_entity_known CHECK (entity IN ('identity_photos', 'identity_embeddings')),
  CONSTRAINT identity_merge_moves_merge_fkey FOREIGN KEY (organization_id, merge_id)
    REFERENCES itap.identity_merges (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT identity_merge_moves_from_identity_fkey FOREIGN KEY (organization_id, from_identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE NO ACTION
);

CREATE INDEX identity_merge_moves_organization_id_from_identity_id_idx
  ON itap.identity_merge_moves (organization_id, from_identity_id);
