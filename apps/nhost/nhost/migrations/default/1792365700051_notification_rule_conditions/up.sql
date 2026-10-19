-- Notification rule conditions (spec §6.0 "JSON exceptions that contain ids", §6.12): a small condition language,
-- validated on write and interpreted by Stage C. An object with only these optional keys (all present keys must match):
--   facility_id   uuid of a facility of the organization: the event's facility
--   area_id       uuid of an area of the organization (of facility_id when both are given): the event's area or a
--                 descendant of it (areas.path)
--   min_severity  an event severity: event severity rank >= it (itap.severity_rank)
-- {} matches every event of the rule's event types. A referenced facility/area deleted later matches nothing.
-- Also: last_triggered_at (written by Stage C) no longer bumps updated_at.
CREATE FUNCTION itap.validate_notification_rule_conditions() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  c constant jsonb := NEW.conditions;
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  area_facility uuid;
BEGIN
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' THEN
    RETURN NEW; -- CHECK notification_rules_conditions_object rejects it
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(c) AS k WHERE k NOT IN ('facility_id', 'area_id', 'min_severity'))
     OR (c ? 'min_severity' AND (jsonb_typeof(c -> 'min_severity') <> 'string' OR itap.severity_rank(c ->> 'min_severity') IS NULL))
     OR (c ? 'facility_id' AND (jsonb_typeof(c -> 'facility_id') <> 'string' OR (c ->> 'facility_id') !~* uuid_re))
     OR (c ? 'area_id' AND (jsonb_typeof(c -> 'area_id') <> 'string' OR (c ->> 'area_id') !~* uuid_re)) THEN
    PERFORM itap.raise_code('notification_rule_conditions_invalid');
  END IF;
  IF c ? 'facility_id' AND NOT EXISTS (
    SELECT 1 FROM itap.facilities f WHERE f.organization_id = NEW.organization_id AND f.id = (c ->> 'facility_id')::uuid
  ) THEN
    PERFORM itap.raise_code('notification_rule_conditions_invalid');
  END IF;
  IF c ? 'area_id' THEN
    SELECT a.facility_id INTO area_facility FROM itap.areas a
    WHERE a.organization_id = NEW.organization_id AND a.id = (c ->> 'area_id')::uuid;
    IF NOT FOUND OR (c ? 'facility_id' AND area_facility <> (c ->> 'facility_id')::uuid) THEN
      PERFORM itap.raise_code('notification_rule_conditions_invalid');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notification_rules_validate_conditions BEFORE INSERT OR UPDATE OF conditions ON itap.notification_rules
  FOR EACH ROW EXECUTE FUNCTION itap.validate_notification_rule_conditions();

-- Whether an event satisfies a rule's (validated) conditions.
CREATE FUNCTION itap.notification_conditions_match(p_conditions jsonb, p_event itap.events) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT coalesce(
    (NOT p_conditions ? 'facility_id' OR p_event.facility_id = (p_conditions ->> 'facility_id')::uuid)
    AND (NOT p_conditions ? 'area_id' OR EXISTS (
      SELECT 1 FROM itap.areas a
      WHERE a.organization_id = p_event.organization_id AND a.id = p_event.area_id
        AND (p_conditions ->> 'area_id')::uuid = ANY (a.path)
    ))
    AND (NOT p_conditions ? 'min_severity'
         OR itap.severity_rank(p_event.severity) >= itap.severity_rank(p_conditions ->> 'min_severity')),
    false
  );
$$;

DROP TRIGGER notification_rules_set_updated_at ON itap.notification_rules;
CREATE TRIGGER notification_rules_set_updated_at BEFORE UPDATE ON itap.notification_rules
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at_except('last_triggered_at');
