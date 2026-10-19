-- Emergency overrides (spec §6.13, SA_5 §2.1.4): a facility-wide (no area rows) or area-limited (area subtrees)
-- unlock_all / lock_all / evacuation with a mandatory justification, bounded to 24 hours. History: never edited
-- except ending it, never deleted. Rows are written only by start_emergency_override / end_emergency_override and
-- the end_emergency_overrides cron (slice 8 task 4), under the transaction-local flag itap.override_context.
CREATE TABLE itap.emergency_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  facility_id uuid NOT NULL,
  mode text NOT NULL REFERENCES itap.override_modes (value),
  justification text NOT NULL,
  started_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  ended_by uuid,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emergency_overrides_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT emergency_overrides_organization_id_facility_id_id_key UNIQUE (organization_id, facility_id, id),
  CONSTRAINT emergency_overrides_justification_length CHECK (char_length(btrim(justification)) >= 10),
  CONSTRAINT emergency_overrides_ends_at_window CHECK (ends_at > started_at AND ends_at <= started_at + interval '24 hours'),
  CONSTRAINT emergency_overrides_ended_after_start CHECK (ended_at IS NULL OR ended_at >= started_at),
  CONSTRAINT emergency_overrides_ended_by_needs_end CHECK (ended_by IS NULL OR ended_at IS NOT NULL),
  CONSTRAINT emergency_overrides_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT emergency_overrides_started_by_fkey FOREIGN KEY (organization_id, started_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT emergency_overrides_ended_by_fkey FOREIGN KEY (organization_id, ended_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX emergency_overrides_organization_id_facility_id_started_at_idx
  ON itap.emergency_overrides (organization_id, facility_id, started_at);
CREATE INDEX emergency_overrides_organization_id_started_by_idx ON itap.emergency_overrides (organization_id, started_by);
CREATE INDEX emergency_overrides_organization_id_ended_by_idx ON itap.emergency_overrides (organization_id, ended_by);
CREATE INDEX emergency_overrides_organization_id_mode_idx ON itap.emergency_overrides (organization_id, mode);
-- Active overrides (check_access, end_emergency_overrides cron).
CREATE INDEX emergency_overrides_active_idx ON itap.emergency_overrides (organization_id, facility_id, ends_at)
  WHERE ended_at IS NULL;

-- Areas an override is limited to (same facility); none = the whole facility. Written with the override.
CREATE TABLE itap.emergency_override_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  facility_id uuid NOT NULL,
  override_id uuid NOT NULL,
  area_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emergency_override_areas_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT emergency_override_areas_override_area_key UNIQUE (organization_id, override_id, area_id),
  CONSTRAINT emergency_override_areas_override_fkey FOREIGN KEY (organization_id, facility_id, override_id)
    REFERENCES itap.emergency_overrides (organization_id, facility_id, id) ON DELETE CASCADE,
  CONSTRAINT emergency_override_areas_area_fkey FOREIGN KEY (organization_id, facility_id, area_id)
    REFERENCES itap.areas (organization_id, facility_id, id) ON DELETE NO ACTION
);
CREATE INDEX emergency_override_areas_organization_id_facility_id_override_id_idx
  ON itap.emergency_override_areas (organization_id, facility_id, override_id);
CREATE INDEX emergency_override_areas_organization_id_facility_id_area_id_idx
  ON itap.emergency_override_areas (organization_id, facility_id, area_id);

-- Writes only under itap.override_context. Updates may only end the override (ended_at / ended_by once).
-- An organization cascade (organization row gone) passes.
CREATE FUNCTION itap.guard_emergency_override() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  in_context boolean := coalesce(current_setting('itap.override_context', true), '') = 'on';
  org uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
  ending text[] := ARRAY['ended_at', 'ended_by', 'updated_at'];
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM itap.organizations o WHERE o.id = org) THEN
    RETURN OLD;
  END IF;
  IF NOT in_context OR TG_OP = 'DELETE' THEN
    PERFORM itap.raise_code('emergency_override_function_only');
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME <> 'emergency_overrides' THEN
      PERFORM itap.raise_code('emergency_override_not_editable');
    END IF;
    IF (to_jsonb(NEW) - ending) IS DISTINCT FROM (to_jsonb(OLD) - ending) OR to_jsonb(OLD) ->> 'ended_at' IS NOT NULL THEN
      PERFORM itap.raise_code('emergency_override_not_editable');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER emergency_overrides_guard BEFORE INSERT OR UPDATE OR DELETE ON itap.emergency_overrides
  FOR EACH ROW EXECUTE FUNCTION itap.guard_emergency_override();
CREATE TRIGGER emergency_overrides_set_updated_at BEFORE UPDATE ON itap.emergency_overrides
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.emergency_overrides
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
CREATE TRIGGER emergency_override_areas_guard BEFORE INSERT OR UPDATE OR DELETE ON itap.emergency_override_areas
  FOR EACH ROW EXECUTE FUNCTION itap.guard_emergency_override();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.emergency_override_areas
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
