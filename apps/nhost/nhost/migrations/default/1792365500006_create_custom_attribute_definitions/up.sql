CREATE TABLE itap.custom_attribute_entities (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.custom_attribute_entities (value, description) VALUES
  ('profile', 'Profiles'),
  ('identity', 'Identities'),
  ('facility', 'Facilities'),
  ('device', 'Devices');

CREATE TABLE itap.custom_attribute_types (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.custom_attribute_types (value, description) VALUES
  ('string', 'Text'),
  ('number', 'Number'),
  ('boolean', 'True / false'),
  ('date', 'Date (YYYY-MM-DD)'),
  ('enum', 'One of the listed options');

-- Per-organization schema of the `custom_fields` jsonb column of an entity (validated by itap.validate_custom_fields).
CREATE TABLE itap.custom_attribute_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  entity text NOT NULL REFERENCES itap.custom_attribute_entities (value),
  key text NOT NULL,
  label text NOT NULL,
  data_type text NOT NULL DEFAULT 'string' REFERENCES itap.custom_attribute_types (value),
  -- Allowed values for data_type = 'enum': a JSON array of strings.
  options jsonb,
  required boolean NOT NULL DEFAULT false,
  -- Free-form rule parameters (reserved; not enforced yet) and UI visibility condition.
  validation jsonb,
  visible_when jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_attribute_definitions_key_format CHECK (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  CONSTRAINT custom_attribute_definitions_options_is_array CHECK (options IS NULL OR jsonb_typeof(options) = 'array'),
  CONSTRAINT custom_attribute_definitions_enum_has_options CHECK (
    data_type <> 'enum' OR (options IS NOT NULL AND jsonb_array_length(options) > 0)
  ),
  CONSTRAINT custom_attribute_definitions_organization_id_entity_key_key UNIQUE (organization_id, entity, key)
);

CREATE INDEX custom_attribute_definitions_organization_id_data_type_idx
  ON itap.custom_attribute_definitions (organization_id, data_type);

CREATE TRIGGER custom_attribute_definitions_set_updated_at
  BEFORE UPDATE ON itap.custom_attribute_definitions
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();

CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.custom_attribute_definitions
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
