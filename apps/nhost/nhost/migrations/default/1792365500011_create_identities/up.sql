-- Identities (spec §6.3): any tracked person, known (linked to a profile) or unknown.
-- System-managed (read-only in metadata): number/code, confidence, first/last_seen_at, detection_count,
-- matching_enabled (consent, §8.2), linked_at/linked_by (set by the link trigger, migration *_create_identity_counters).
CREATE TABLE itap.identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  number bigint NOT NULL,
  code text GENERATED ALWAYS AS ('IDENTITY-' || lpad(number::text, 5, '0')) STORED,
  status text NOT NULL DEFAULT 'unverified' REFERENCES itap.identity_statuses (value),
  profile_id uuid,
  -- Strength of the profile link, 0..1 (1 = confirmed by an operator or enrollment).
  link_strength real,
  linked_at timestamptz,
  linked_by uuid,
  is_primary_for_profile boolean NOT NULL DEFAULT false,
  confidence real,
  attributes jsonb NOT NULL DEFAULT '{}',
  custom_fields jsonb NOT NULL DEFAULT '{}',
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  detection_count integer NOT NULL DEFAULT 0,
  primary_photo_file_id uuid REFERENCES storage.files (id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual' REFERENCES itap.identity_sources (value),
  matching_enabled boolean NOT NULL DEFAULT true,
  is_synthetic boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identities_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT identities_organization_id_number_key UNIQUE (organization_id, number),
  CONSTRAINT identities_organization_id_code_key UNIQUE (organization_id, code),
  -- Deleting a profile unlinks its identities (history stays on the identity).
  CONSTRAINT identities_profile_fkey FOREIGN KEY (organization_id, profile_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE SET NULL (profile_id),
  -- NO ACTION (not RESTRICT): checked at statement end, so an organization cascade completes.
  CONSTRAINT identities_linked_by_fkey FOREIGN KEY (organization_id, linked_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT identities_link_strength_range CHECK (link_strength IS NULL OR link_strength BETWEEN 0 AND 1),
  CONSTRAINT identities_confidence_range CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  CONSTRAINT identities_detection_count_nonnegative CHECK (detection_count >= 0),
  CONSTRAINT identities_attributes_object CHECK (jsonb_typeof(attributes) = 'object'),
  CONSTRAINT identities_primary_requires_profile CHECK (NOT is_primary_for_profile OR profile_id IS NOT NULL)
);

CREATE INDEX identities_organization_id_profile_id_idx ON itap.identities (organization_id, profile_id);
CREATE UNIQUE INDEX identities_primary_for_profile_key ON itap.identities (organization_id, profile_id)
  WHERE is_primary_for_profile;
CREATE INDEX identities_organization_id_linked_by_idx ON itap.identities (organization_id, linked_by);
CREATE INDEX identities_organization_id_status_idx ON itap.identities (organization_id, status);
CREATE INDEX identities_organization_id_source_idx ON itap.identities (organization_id, source);
CREATE INDEX identities_organization_id_last_seen_at_idx ON itap.identities (organization_id, last_seen_at);
CREATE INDEX identities_organization_id_primary_photo_file_id_idx
  ON itap.identities (organization_id, primary_photo_file_id);

CREATE TRIGGER identities_number BEFORE INSERT ON itap.identities
  FOR EACH ROW EXECUTE FUNCTION itap.assign_number('identity');
CREATE TRIGGER identities_set_updated_at BEFORE UPDATE ON itap.identities
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER identities_check_files BEFORE INSERT OR UPDATE OF primary_photo_file_id ON itap.identities
  FOR EACH ROW EXECUTE FUNCTION itap.check_file_bucket('primary_photo_file_id');
CREATE TRIGGER identities_validate_custom_fields BEFORE INSERT OR UPDATE ON itap.identities
  FOR EACH ROW EXECUTE FUNCTION itap.validate_custom_fields('identity');
-- Detection counters are throttled system writes (§8.1): never audited.
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.identities
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change(
    'ignore:last_seen_at', 'ignore:detection_count', 'ignore:first_seen_at', 'ignore:confidence'
  );
