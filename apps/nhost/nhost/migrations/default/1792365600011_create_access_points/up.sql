-- Doors, turnstiles and gates (spec §6.6). Same-facility consistency (spec §4.1): both areas are composite FKs that
-- carry facility_id, so an access point can only join areas of its own facility. area_id is the area the access point
-- gives entry to, from_area_id the area it is entered from (NULL = outside the facility). Lifecycle by status; the
-- status values are those of areas (active / inactive / maintenance).
CREATE TABLE itap.access_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  facility_id uuid NOT NULL,
  area_id uuid NOT NULL,
  from_area_id uuid,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'door' REFERENCES itap.access_point_kinds (value),
  direction text NOT NULL DEFAULT 'both' REFERENCES itap.access_point_directions (value),
  -- Point [x, y] in the floor-plan pixel space.
  position jsonb,
  -- Defines the facility exits (a person leaving through one ends the visit).
  is_entry_exit boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' REFERENCES itap.area_statuses (value),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Target of the same-facility FK of access_point_devices.
  CONSTRAINT access_points_organization_id_facility_id_id_key UNIQUE (organization_id, facility_id, id),
  CONSTRAINT access_points_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id),
  CONSTRAINT access_points_area_fkey FOREIGN KEY (organization_id, facility_id, area_id)
    REFERENCES itap.areas (organization_id, facility_id, id),
  CONSTRAINT access_points_from_area_fkey FOREIGN KEY (organization_id, facility_id, from_area_id)
    REFERENCES itap.areas (organization_id, facility_id, id),
  CONSTRAINT access_points_areas_differ CHECK (from_area_id IS NULL OR from_area_id <> area_id),
  CONSTRAINT access_points_position_valid CHECK (position IS NULL OR itap.valid_point(position))
);

CREATE INDEX access_points_organization_id_facility_id_area_id_idx ON itap.access_points (organization_id, facility_id, area_id);
CREATE INDEX access_points_organization_id_facility_id_from_area_id_idx ON itap.access_points (organization_id, facility_id, from_area_id);
CREATE INDEX access_points_organization_id_kind_idx ON itap.access_points (organization_id, kind);
CREATE INDEX access_points_organization_id_direction_idx ON itap.access_points (organization_id, direction);
CREATE INDEX access_points_organization_id_status_idx ON itap.access_points (organization_id, status);

CREATE TRIGGER access_points_set_updated_at BEFORE UPDATE ON itap.access_points
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.access_points
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
