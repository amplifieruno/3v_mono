-- Restores the definitions without the segment_id condition key.
CREATE OR REPLACE FUNCTION itap.validate_notification_rule_conditions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION itap.notification_conditions_match(p_conditions jsonb, p_event itap.events)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION itap.segments_guard_referenced()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
BEGIN
  -- Organization delete cascade: everything goes.
  IF NOT EXISTS (SELECT 1 FROM itap.organizations o WHERE o.id = OLD.organization_id) THEN
    RETURN OLD;
  END IF;
  IF EXISTS (
    SELECT 1 FROM itap.segments s
    WHERE s.organization_id = OLD.organization_id AND s.kind = 'dynamic' AND s.id <> OLD.id
      AND OLD.id = ANY (itap.segment_condition_segment_ids(s.conditions))
  ) OR EXISTS (
    SELECT 1 FROM itap.segment_templates t
    WHERE t.organization_id = OLD.organization_id AND OLD.id = ANY (itap.segment_condition_segment_ids(t.conditions))
  ) THEN
    PERFORM itap.raise_code('segment_referenced');
  END IF;
  RETURN OLD;
END;
$function$;
