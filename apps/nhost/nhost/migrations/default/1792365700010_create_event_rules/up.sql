-- Event rules (spec §6.9), a versioned entity (spec §6.0; helpers in *_create_versioning_helpers): the header
-- event_rules (code RULE-xxxxx, FS "RULE-789"; current_version_id / last_triggered_at / trigger_count read-only),
-- versions event_rule_versions (parameters, severity, creates_incident, escalation_policy_id) and their scopes
-- event_rule_version_scopes (exactly one of facility / area / segment per row; no rows = everywhere).
-- escalation_policy_id gets its FK in slice 5 (escalation policies), segment_id in slice 6 (segments).
-- Configuration: a rule can be deleted (its versions and scopes go with it, events keep their row with
-- rule_version_id SET NULL); disable it with is_enabled instead to keep history.
CREATE TABLE itap.event_rule_types (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.event_rule_types (value, description) VALUES
  ('after_hours', 'Presence outside operating hours'),
  ('loitering', 'Staying in an area longer than its threshold'),
  ('unusual_dwell', 'Unusually long stay in an area'),
  ('occupancy', 'Area occupancy above capacity'),
  ('restricted_area', 'Entry into an area above clearance'),
  ('inactive_profile', 'Suspended or terminated profile detected'),
  ('watchlist', 'Watch list, blacklist or VIP match'),
  ('tailgating', 'More passages than granted accesses'),
  ('unexpected_facility', 'First visit of a known person to a facility'),
  ('abnormal_movement', 'Area transition not seen before');

CREATE TABLE itap.event_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  number bigint NOT NULL,
  code text GENERATED ALWAYS AS ('RULE-' || lpad(number::text, 5, '0')) STORED,
  name text NOT NULL,
  description text,
  rule_type text NOT NULL REFERENCES itap.event_rule_types (value),
  is_enabled boolean NOT NULL DEFAULT true,
  current_version_id uuid,
  last_triggered_at timestamptz,
  trigger_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_rules_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT event_rules_organization_id_number_key UNIQUE (organization_id, number),
  CONSTRAINT event_rules_organization_id_code_key UNIQUE (organization_id, code),
  CONSTRAINT event_rules_organization_id_name_key UNIQUE (organization_id, name),
  CONSTRAINT event_rules_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT event_rules_trigger_count_nonnegative CHECK (trigger_count >= 0)
);
CREATE INDEX event_rules_organization_id_rule_type_idx ON itap.event_rules (organization_id, rule_type);
CREATE INDEX event_rules_organization_id_current_version_id_idx ON itap.event_rules (organization_id, current_version_id);

CREATE TABLE itap.event_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  rule_id uuid NOT NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' REFERENCES itap.version_statuses (value),
  -- Rule-type specific thresholds and windows (e.g. {"dwell_seconds": 900}); a JSON object, never ids.
  parameters jsonb NOT NULL DEFAULT '{}',
  severity text NOT NULL DEFAULT 'medium' REFERENCES itap.event_severities (value),
  creates_incident boolean NOT NULL DEFAULT false,
  -- FK to escalation_policies in slice 5; copied to incidents created by this version.
  escalation_policy_id uuid,
  published_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_rule_versions_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT event_rule_versions_organization_id_rule_id_version_key UNIQUE (organization_id, rule_id, version),
  CONSTRAINT event_rule_versions_version_positive CHECK (version > 0),
  CONSTRAINT event_rule_versions_parameters_object CHECK (jsonb_typeof(parameters) = 'object'),
  CONSTRAINT event_rule_versions_published_consistent CHECK (
    status NOT IN ('published', 'superseded') OR published_at IS NOT NULL
  ),
  CONSTRAINT event_rule_versions_rule_fkey FOREIGN KEY (organization_id, rule_id)
    REFERENCES itap.event_rules (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT event_rule_versions_published_by_fkey FOREIGN KEY (organization_id, published_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX event_rule_versions_organization_id_status_idx ON itap.event_rule_versions (organization_id, status);
CREATE INDEX event_rule_versions_organization_id_severity_idx ON itap.event_rule_versions (organization_id, severity);
CREATE INDEX event_rule_versions_organization_id_published_by_idx ON itap.event_rule_versions (organization_id, published_by);
CREATE INDEX event_rule_versions_organization_id_escalation_policy_id_idx
  ON itap.event_rule_versions (organization_id, escalation_policy_id);
-- One enforced version and at most one open (editable) version per rule.
CREATE UNIQUE INDEX event_rule_versions_one_published_key ON itap.event_rule_versions (organization_id, rule_id)
  WHERE status = 'published';
CREATE UNIQUE INDEX event_rule_versions_one_open_key ON itap.event_rule_versions (organization_id, rule_id)
  WHERE status IN ('draft', 'pending_approval');

-- The enforced version. Read-only in metadata, written only by itap.publish_version (which keeps it within the
-- rule). NO ACTION: the current version cannot be deleted on its own; deleting the rule removes both.
ALTER TABLE itap.event_rules ADD CONSTRAINT event_rules_current_version_fkey FOREIGN KEY (organization_id, current_version_id)
  REFERENCES itap.event_rule_versions (organization_id, id) ON DELETE NO ACTION;

CREATE TABLE itap.event_rule_version_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  version_id uuid NOT NULL,
  facility_id uuid,
  area_id uuid,
  -- FK to segments in slice 6.
  segment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_rule_version_scopes_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT event_rule_version_scopes_exactly_one_target CHECK (num_nonnulls(facility_id, area_id, segment_id) = 1),
  CONSTRAINT event_rule_version_scopes_version_fkey FOREIGN KEY (organization_id, version_id)
    REFERENCES itap.event_rule_versions (organization_id, id) ON DELETE CASCADE,
  -- Configuration referencing configuration: NO ACTION (spec §6.0).
  CONSTRAINT event_rule_version_scopes_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT event_rule_version_scopes_area_fkey FOREIGN KEY (organization_id, area_id)
    REFERENCES itap.areas (organization_id, id) ON DELETE NO ACTION
);
CREATE INDEX event_rule_version_scopes_organization_id_version_id_idx
  ON itap.event_rule_version_scopes (organization_id, version_id);
CREATE INDEX event_rule_version_scopes_organization_id_facility_id_idx
  ON itap.event_rule_version_scopes (organization_id, facility_id);
CREATE INDEX event_rule_version_scopes_organization_id_area_id_idx ON itap.event_rule_version_scopes (organization_id, area_id);
CREATE INDEX event_rule_version_scopes_organization_id_segment_id_idx
  ON itap.event_rule_version_scopes (organization_id, segment_id);
CREATE UNIQUE INDEX event_rule_version_scopes_facility_key ON itap.event_rule_version_scopes (organization_id, version_id, facility_id)
  WHERE facility_id IS NOT NULL;
CREATE UNIQUE INDEX event_rule_version_scopes_area_key ON itap.event_rule_version_scopes (organization_id, version_id, area_id)
  WHERE area_id IS NOT NULL;
CREATE UNIQUE INDEX event_rule_version_scopes_segment_key ON itap.event_rule_version_scopes (organization_id, version_id, segment_id)
  WHERE segment_id IS NOT NULL;

CREATE TRIGGER event_rules_number BEFORE INSERT ON itap.event_rules
  FOR EACH ROW EXECUTE FUNCTION itap.assign_number('event_rule');
CREATE TRIGGER event_rules_set_updated_at BEFORE UPDATE ON itap.event_rules
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
-- last_triggered_at / trigger_count are written by Stage B per event: not audited.
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.event_rules
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change('ignore:last_triggered_at', 'ignore:trigger_count');

CREATE TRIGGER event_rule_versions_number BEFORE INSERT ON itap.event_rule_versions
  FOR EACH ROW EXECUTE FUNCTION itap.assign_version_number('rule_id', 'itap.event_rules');
CREATE TRIGGER event_rule_versions_guard_status BEFORE INSERT OR UPDATE ON itap.event_rule_versions
  FOR EACH ROW EXECUTE FUNCTION itap.guard_version_status();
CREATE TRIGGER event_rule_versions_set_updated_at BEFORE UPDATE ON itap.event_rule_versions
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.event_rule_versions
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

CREATE TRIGGER event_rule_version_scopes_guard BEFORE INSERT OR UPDATE OR DELETE ON itap.event_rule_version_scopes
  FOR EACH ROW EXECUTE FUNCTION itap.guard_version_children('version_id', 'itap.event_rule_versions');
CREATE TRIGGER event_rule_version_scopes_set_updated_at BEFORE UPDATE ON itap.event_rule_version_scopes
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.event_rule_version_scopes
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
