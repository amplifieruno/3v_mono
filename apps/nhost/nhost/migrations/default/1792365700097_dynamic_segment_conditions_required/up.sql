-- A dynamic segment must have conditions (slice 6 task 2, review round 1 ruling): '{}' (or NULL) on insert / update
-- of a dynamic segment raises segment_conditions_required before the CHECK segments_conditions_match_kind would.
-- Manual segments keep '{}'.
CREATE OR REPLACE FUNCTION itap.segments_validate_conditions() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF NEW.kind = 'dynamic' AND (NEW.conditions IS NULL OR NEW.conditions = '{}'::jsonb) THEN
    PERFORM itap.raise_code('segment_conditions_required');
  END IF;
  IF NEW.kind = 'dynamic' THEN
    PERFORM itap.lock_condition_segments(NEW.organization_id, NEW.conditions);
    PERFORM itap.validate_segment_conditions(NEW.organization_id, NEW.target, NEW.conditions, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
