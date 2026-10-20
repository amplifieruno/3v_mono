-- Records of processing activities with their DPIA (spec §6.14, SA_4; slice 10 task 1). Code PA-xxxxx. Data
-- categories are the retention data classes (junction, spec §6.0 enum sets) instead of free jsonb; the retention
-- policy is configuration (NO ACTION: a referenced policy is deactivated, not deleted). dpia_file_id: a file of kind
-- dpia in the organization bucket (an ordinary, non-sensitive document org_admin uploads). owner_id: an active member.
CREATE TABLE itap.processing_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  number bigint NOT NULL,
  code text GENERATED ALWAYS AS ('PA-' || lpad(number::text, 5, '0')) STORED,
  name text NOT NULL,
  purpose text NOT NULL,
  legal_basis text NOT NULL REFERENCES itap.legal_bases (value),
  description text,
  retention_policy_id uuid,
  dpia_status text NOT NULL DEFAULT 'not_required' REFERENCES itap.dpia_statuses (value),
  dpia_file_id uuid REFERENCES storage.files (id) ON DELETE SET NULL,
  owner_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT processing_activities_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT processing_activities_organization_id_number_key UNIQUE (organization_id, number),
  CONSTRAINT processing_activities_organization_id_code_key UNIQUE (organization_id, code),
  CONSTRAINT processing_activities_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT processing_activities_purpose_not_blank CHECK (btrim(purpose) <> ''),
  CONSTRAINT processing_activities_retention_policy_fkey FOREIGN KEY (organization_id, retention_policy_id)
    REFERENCES itap.retention_policies (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT processing_activities_owner_fkey FOREIGN KEY (organization_id, owner_id)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT processing_activities_created_by_fkey FOREIGN KEY (organization_id, created_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX processing_activities_organization_id_retention_policy_id_idx ON itap.processing_activities (organization_id, retention_policy_id);
CREATE INDEX processing_activities_organization_id_owner_id_idx ON itap.processing_activities (organization_id, owner_id);
CREATE INDEX processing_activities_organization_id_created_by_idx ON itap.processing_activities (organization_id, created_by);
CREATE INDEX processing_activities_organization_id_dpia_file_id_idx ON itap.processing_activities (organization_id, dpia_file_id);
CREATE INDEX processing_activities_organization_id_dpia_status_idx ON itap.processing_activities (organization_id, dpia_status);
CREATE INDEX processing_activities_organization_id_legal_basis_idx ON itap.processing_activities (organization_id, legal_basis);
CREATE TRIGGER processing_activities_number BEFORE INSERT ON itap.processing_activities
  FOR EACH ROW EXECUTE FUNCTION itap.assign_number('processing_activity');
CREATE TRIGGER processing_activities_check_files BEFORE INSERT OR UPDATE OF dpia_file_id ON itap.processing_activities
  FOR EACH ROW EXECUTE FUNCTION itap.check_file_bucket('dpia_file_id');
CREATE TRIGGER processing_activities_check_file_kinds BEFORE INSERT OR UPDATE OF dpia_file_id ON itap.processing_activities
  FOR EACH ROW EXECUTE FUNCTION itap.check_file_kind('dpia_file_id', 'dpia');
CREATE TRIGGER processing_activities_owner_active BEFORE INSERT OR UPDATE OF owner_id ON itap.processing_activities
  FOR EACH ROW EXECUTE FUNCTION itap.active_member_check('owner_id');
CREATE TRIGGER processing_activities_set_updated_at BEFORE UPDATE ON itap.processing_activities
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.processing_activities
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

CREATE TABLE itap.processing_activity_data_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  activity_id uuid NOT NULL,
  data_class text NOT NULL REFERENCES itap.retention_data_classes (value),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT processing_activity_data_classes_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT processing_activity_data_classes_key UNIQUE (organization_id, activity_id, data_class),
  CONSTRAINT processing_activity_data_classes_activity_fkey FOREIGN KEY (organization_id, activity_id)
    REFERENCES itap.processing_activities (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX processing_activity_data_classes_organization_id_data_class_idx ON itap.processing_activity_data_classes (organization_id, data_class);
CREATE TRIGGER processing_activity_data_classes_set_updated_at BEFORE UPDATE ON itap.processing_activity_data_classes
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.processing_activity_data_classes
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
