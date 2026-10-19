-- Cameras, terminals and sensors (spec §6.7). Lifecycle by status (spec §6.0): a device that anything references
-- cannot be deleted (NO ACTION FKs); retire it with status 'inactive'. Junction rows (device_areas,
-- access_point_devices) go with the device; captured photos keep existing with device_id set to NULL.
CREATE TABLE itap.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  number bigint NOT NULL,
  code text GENERATED ALWAYS AS ('DEVICE-' || lpad(number::text, 5, '0')) STORED,
  name text NOT NULL,
  device_type text NOT NULL REFERENCES itap.device_types (value),
  facility_id uuid NOT NULL,
  -- Primary area; further covered areas are device_areas rows.
  area_id uuid,
  -- Point [x, y] and covered shape (itap.valid_shape) in the floor-plan pixel space.
  position jsonb,
  coverage jsonb,
  stream_url text,
  resolution text,
  fps integer,
  status text NOT NULL DEFAULT 'active' REFERENCES itap.device_statuses (value),
  -- System-maintained (health check cron, terminal policy sync): read-only for clients, not audited.
  health_status text NOT NULL DEFAULT 'unknown' REFERENCES itap.device_health_statuses (value),
  last_seen_at timestamptz,
  manufacturer text,
  model text,
  firmware_version text,
  ip_address inet,
  configuration jsonb NOT NULL DEFAULT '{}',
  custom_fields jsonb NOT NULL DEFAULT '{}',
  recognition_enabled boolean NOT NULL DEFAULT false,
  recognition_fps integer NOT NULL DEFAULT 1,
  username text,
  -- Secret: writable, never selectable, redacted in audit.
  password text,
  policy_version_synced bigint,
  policy_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT devices_organization_id_id_key UNIQUE (organization_id, id),
  -- Target of the same-facility FK of access_point_devices / device_areas.
  CONSTRAINT devices_organization_id_facility_id_id_key UNIQUE (organization_id, facility_id, id),
  CONSTRAINT devices_organization_id_number_key UNIQUE (organization_id, number),
  CONSTRAINT devices_organization_id_code_key UNIQUE (organization_id, code),
  CONSTRAINT devices_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id),
  CONSTRAINT devices_area_fkey FOREIGN KEY (organization_id, facility_id, area_id)
    REFERENCES itap.areas (organization_id, facility_id, id),
  CONSTRAINT devices_position_valid CHECK (position IS NULL OR itap.valid_point(position)),
  CONSTRAINT devices_coverage_valid CHECK (coverage IS NULL OR itap.valid_shape(coverage)),
  CONSTRAINT devices_fps_positive CHECK (fps IS NULL OR fps > 0),
  CONSTRAINT devices_recognition_fps_range CHECK (recognition_fps BETWEEN 1 AND 5),
  CONSTRAINT devices_configuration_is_object CHECK (jsonb_typeof(configuration) = 'object')
);

CREATE INDEX devices_organization_id_facility_id_idx ON itap.devices (organization_id, facility_id);
CREATE INDEX devices_organization_id_facility_id_area_id_idx ON itap.devices (organization_id, facility_id, area_id);
CREATE INDEX devices_organization_id_device_type_idx ON itap.devices (organization_id, device_type);
CREATE INDEX devices_organization_id_status_idx ON itap.devices (organization_id, status);
CREATE INDEX devices_organization_id_health_status_idx ON itap.devices (organization_id, health_status);

CREATE TRIGGER devices_number BEFORE INSERT ON itap.devices
  FOR EACH ROW EXECUTE FUNCTION itap.assign_number('device');
CREATE TRIGGER devices_set_updated_at BEFORE UPDATE ON itap.devices
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER devices_validate_custom_fields BEFORE INSERT OR UPDATE ON itap.devices
  FOR EACH ROW EXECUTE FUNCTION itap.validate_custom_fields('device');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.devices
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change(
    'password', 'ignore:health_status', 'ignore:last_seen_at', 'ignore:policy_version_synced', 'ignore:policy_synced_at'
  );
