DROP FUNCTION itap.end_emergency_overrides(uuid, timestamptz);
DROP FUNCTION itap.end_emergency_override(json, uuid, text);
DROP FUNCTION itap.close_emergency_override(uuid, uuid, uuid, timestamptz, text);
DROP FUNCTION itap.start_emergency_override(json, uuid, text, text, timestamptz, uuid[]);
DROP FUNCTION itap.require_active_member(json);
DROP FUNCTION itap.emit_override_event(itap.emergency_overrides, text, timestamptz, uuid[]);

CREATE OR REPLACE FUNCTION itap.guard_emergency_override() RETURNS trigger
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

ALTER TABLE itap.emergency_overrides DROP CONSTRAINT emergency_overrides_end_reason_needs_end, DROP COLUMN end_reason;
