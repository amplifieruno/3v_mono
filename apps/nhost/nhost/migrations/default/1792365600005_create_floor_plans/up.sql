-- Floor plans (spec §6.6): one per area (the floor; any area type may carry one, e.g. a lobby or parking level).
-- Shapes of areas and devices on the floor are in this plan's pixel space; an area or device finds its plan through
-- its nearest ancestor with a plan. The plan is an owned child of its area (CASCADE); the image file stays.
CREATE TABLE itap.floor_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  facility_id uuid NOT NULL,
  area_id uuid NOT NULL,
  name text NOT NULL,
  image_file_id uuid REFERENCES storage.files (id) ON DELETE SET NULL,
  width_px integer NOT NULL,
  height_px integer NOT NULL,
  scale_m_per_px numeric,
  -- Building level (0 = ground, negative = underground).
  level integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT floor_plans_organization_id_area_id_key UNIQUE (organization_id, area_id),
  CONSTRAINT floor_plans_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id),
  CONSTRAINT floor_plans_area_fkey FOREIGN KEY (organization_id, facility_id, area_id)
    REFERENCES itap.areas (organization_id, facility_id, id) ON DELETE CASCADE,
  CONSTRAINT floor_plans_size_positive CHECK (width_px > 0 AND height_px > 0),
  CONSTRAINT floor_plans_scale_positive CHECK (scale_m_per_px IS NULL OR scale_m_per_px > 0)
);

CREATE INDEX floor_plans_organization_id_facility_id_area_id_idx ON itap.floor_plans (organization_id, facility_id, area_id);
CREATE INDEX floor_plans_organization_id_image_file_id_idx ON itap.floor_plans (organization_id, image_file_id);

CREATE TRIGGER floor_plans_set_updated_at BEFORE UPDATE ON itap.floor_plans
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER floor_plans_check_files BEFORE INSERT OR UPDATE OF image_file_id ON itap.floor_plans
  FOR EACH ROW EXECUTE FUNCTION itap.check_file_bucket('image_file_id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.floor_plans
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
