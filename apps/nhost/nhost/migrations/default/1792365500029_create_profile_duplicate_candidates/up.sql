-- Possible duplicate profiles found by the system (review queue, spec §6.4). Ordered pair, one row per pair.
-- Written by the system; org_admin may only change the status (dismiss); merge_profiles closes pairs as merged.
CREATE TABLE itap.profile_duplicate_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  profile_a_id uuid NOT NULL,
  profile_b_id uuid NOT NULL,
  similarity real NOT NULL,
  -- Why the pair matched, e.g. ["email", "employee_id"].
  reasons jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'open' REFERENCES itap.candidate_statuses (value),
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_duplicate_candidates_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT profile_duplicate_candidates_pair_key UNIQUE (organization_id, profile_a_id, profile_b_id),
  CONSTRAINT profile_duplicate_candidates_ordered_pair CHECK (profile_a_id < profile_b_id),
  CONSTRAINT profile_duplicate_candidates_similarity_range CHECK (similarity BETWEEN 0 AND 1),
  CONSTRAINT profile_duplicate_candidates_reasons_array CHECK (jsonb_typeof(reasons) = 'array'),
  CONSTRAINT profile_duplicate_candidates_profile_a_fkey FOREIGN KEY (organization_id, profile_a_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT profile_duplicate_candidates_profile_b_fkey FOREIGN KEY (organization_id, profile_b_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX profile_duplicate_candidates_organization_id_profile_b_id_idx
  ON itap.profile_duplicate_candidates (organization_id, profile_b_id);
CREATE INDEX profile_duplicate_candidates_organization_id_status_idx
  ON itap.profile_duplicate_candidates (organization_id, status);

CREATE TRIGGER profile_duplicate_candidates_set_updated_at BEFORE UPDATE ON itap.profile_duplicate_candidates
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.profile_duplicate_candidates
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
