-- Integrations (spec §6.15; slice 10 task 1 creates the table, task 4 the sync runs and run logic). Code INT-xxxxx.
-- secret: write-only credential (never selectable, redacted in audit). last_sync_at / last_error: system columns
-- (not audited). status error is set by the system; org_admin switches active / paused. The deferred FK
-- profiles.source_integration_id (slice 2) lands here: SET NULL (source_integration_id) when an integration is
-- deleted (the profile keeps external_id); HR sync keys profiles by (source_integration_id, external_id), unique.
CREATE TABLE itap.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  number bigint NOT NULL,
  code text GENERATED ALWAYS AS ('INT-' || lpad(number::text, 5, '0')) STORED,
  name text NOT NULL,
  description text,
  kind text NOT NULL REFERENCES itap.integration_kinds (value),
  provider text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  direction text NOT NULL DEFAULT 'inbound' REFERENCES itap.integration_directions (value),
  status text NOT NULL DEFAULT 'active' REFERENCES itap.integration_statuses (value),
  secret text,
  last_sync_at timestamptz,
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integrations_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT integrations_organization_id_number_key UNIQUE (organization_id, number),
  CONSTRAINT integrations_organization_id_code_key UNIQUE (organization_id, code),
  CONSTRAINT integrations_organization_id_name_key UNIQUE (organization_id, name),
  CONSTRAINT integrations_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT integrations_provider_not_blank CHECK (btrim(provider) <> ''),
  CONSTRAINT integrations_config_object CHECK (jsonb_typeof(config) = 'object'),
  CONSTRAINT integrations_field_mapping_object CHECK (jsonb_typeof(field_mapping) = 'object'),
  CONSTRAINT integrations_created_by_fkey FOREIGN KEY (organization_id, created_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX integrations_organization_id_kind_idx ON itap.integrations (organization_id, kind);
CREATE INDEX integrations_organization_id_status_idx ON itap.integrations (organization_id, status);
CREATE INDEX integrations_organization_id_direction_idx ON itap.integrations (organization_id, direction);
CREATE INDEX integrations_organization_id_created_by_idx ON itap.integrations (organization_id, created_by);
CREATE TRIGGER integrations_number BEFORE INSERT ON itap.integrations
  FOR EACH ROW EXECUTE FUNCTION itap.assign_number('integration');
CREATE TRIGGER integrations_set_updated_at BEFORE UPDATE ON itap.integrations
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.integrations
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change('secret', 'ignore:last_sync_at', 'ignore:last_error');

CREATE UNIQUE INDEX profiles_source_integration_external_key
  ON itap.profiles (organization_id, source_integration_id, external_id);
ALTER TABLE itap.profiles ADD CONSTRAINT profiles_source_integration_fkey
  FOREIGN KEY (organization_id, source_integration_id)
  REFERENCES itap.integrations (organization_id, id) ON DELETE SET NULL (source_integration_id);
