-- Additional areas a device covers (the primary one is devices.area_id). Both FKs carry facility_id: device and area
-- must be in the same facility. The link goes with the device (CASCADE); an area that is still covered cannot be deleted.
CREATE TABLE itap.device_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  facility_id uuid NOT NULL,
  device_id uuid NOT NULL,
  area_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_areas_organization_id_device_id_area_id_key UNIQUE (organization_id, device_id, area_id),
  CONSTRAINT device_areas_device_fkey FOREIGN KEY (organization_id, facility_id, device_id)
    REFERENCES itap.devices (organization_id, facility_id, id) ON DELETE CASCADE,
  CONSTRAINT device_areas_area_fkey FOREIGN KEY (organization_id, facility_id, area_id)
    REFERENCES itap.areas (organization_id, facility_id, id)
);

CREATE INDEX device_areas_organization_id_facility_id_device_id_idx ON itap.device_areas (organization_id, facility_id, device_id);
CREATE INDEX device_areas_organization_id_facility_id_area_id_idx ON itap.device_areas (organization_id, facility_id, area_id);

CREATE TRIGGER device_areas_set_updated_at BEFORE UPDATE ON itap.device_areas
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.device_areas
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

-- Cameras, terminals and sensors installed at an access point. A device bound to an access point must be in the
-- same facility: both FKs carry facility_id. Bindings go with either side (CASCADE).
CREATE TABLE itap.access_point_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  facility_id uuid NOT NULL,
  access_point_id uuid NOT NULL,
  device_id uuid NOT NULL,
  role text NOT NULL REFERENCES itap.access_point_device_roles (value),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_point_devices_org_access_point_device_key
    UNIQUE (organization_id, access_point_id, device_id),
  CONSTRAINT access_point_devices_access_point_fkey FOREIGN KEY (organization_id, facility_id, access_point_id)
    REFERENCES itap.access_points (organization_id, facility_id, id) ON DELETE CASCADE,
  CONSTRAINT access_point_devices_device_fkey FOREIGN KEY (organization_id, facility_id, device_id)
    REFERENCES itap.devices (organization_id, facility_id, id) ON DELETE CASCADE
);

CREATE INDEX access_point_devices_org_facility_access_point_idx
  ON itap.access_point_devices (organization_id, facility_id, access_point_id);
CREATE INDEX access_point_devices_org_facility_device_idx
  ON itap.access_point_devices (organization_id, facility_id, device_id);

CREATE INDEX access_point_devices_organization_id_role_idx ON itap.access_point_devices (organization_id, role);

CREATE TRIGGER access_point_devices_set_updated_at BEFORE UPDATE ON itap.access_point_devices
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.access_point_devices
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
