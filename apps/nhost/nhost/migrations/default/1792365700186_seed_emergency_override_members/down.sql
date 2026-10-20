-- Restore seed_emergency_override without the member checks.
CREATE OR REPLACE FUNCTION itap.seed_emergency_override(p_organization uuid, p_facility uuid, p_mode text, p_justification text, p_started_at timestamp with time zone, p_ends_at timestamp with time zone, p_started_by uuid, p_ended_at timestamp with time zone, p_ended_by uuid, p_end_reason text, p_area_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS SETOF itap.emergency_overrides
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  areas uuid[] := ARRAY(SELECT DISTINCT a FROM unnest(coalesce(p_area_ids, '{}')) a WHERE a IS NOT NULL ORDER BY a);
  ov itap.emergency_overrides;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM itap.facilities f WHERE f.organization_id = p_organization AND f.id = p_facility) THEN
    PERFORM itap.raise_code('facility_not_found');
  END IF;
  IF p_mode IS NULL OR NOT EXISTS (SELECT 1 FROM itap.override_modes m WHERE m.value = p_mode) THEN
    PERFORM itap.raise_code('override_mode_invalid');
  END IF;
  IF char_length(btrim(coalesce(p_justification, ''))) < 10 THEN
    PERFORM itap.raise_code('justification_required');
  END IF;
  IF p_started_at IS NULL OR p_ends_at IS NULL OR p_ended_at IS NULL OR p_ends_at <= p_started_at
     OR p_ends_at > p_started_at + interval '24 hours' OR p_ended_at <= p_started_at OR p_ended_at > now() THEN
    PERFORM itap.raise_code('override_ends_at_invalid');
  END IF;
  IF nullif(btrim(coalesce(p_end_reason, '')), '') IS NULL THEN
    PERFORM itap.raise_code('end_reason_required');
  END IF;
  IF cardinality(areas) > 0 AND (
    SELECT count(*) FROM itap.areas a WHERE a.organization_id = p_organization AND a.facility_id = p_facility AND a.id = ANY (areas)
  ) <> cardinality(areas) THEN
    PERFORM itap.raise_code('area_not_found');
  END IF;

  ov.id := gen_random_uuid();
  ov.organization_id := p_organization;
  ov.facility_id := p_facility;
  ov.mode := p_mode;
  ov.justification := btrim(p_justification);
  ov.started_by := p_started_by;
  ov.started_at := p_started_at;
  ov.ends_at := p_ends_at;
  PERFORM itap.emit_override_event(ov, 'started', ov.started_at, areas);
  PERFORM set_config('itap.override_context', 'on', true);
  INSERT INTO itap.emergency_overrides
    (id, organization_id, facility_id, mode, justification, started_by, started_at, ends_at, created_at)
  VALUES (ov.id, p_organization, p_facility, p_mode, ov.justification, p_started_by, p_started_at, p_ends_at, p_started_at);
  INSERT INTO itap.emergency_override_areas (organization_id, facility_id, override_id, area_id, created_at)
  SELECT p_organization, p_facility, ov.id, a, p_started_at FROM unnest(areas) a;
  PERFORM set_config('itap.override_context', 'off', true);
  -- The end at the simulated time (ended_at = least(p_ended_at, ends_at)), event included.
  PERFORM itap.close_emergency_override(p_organization, ov.id, p_ended_by, p_ended_at, btrim(p_end_reason));
  RETURN QUERY SELECT * FROM itap.emergency_overrides e WHERE e.organization_id = p_organization AND e.id = ov.id;
END;
$function$

;
