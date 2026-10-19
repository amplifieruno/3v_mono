-- Restores the *_segment_conditions_fix_round1 trigger function.
CREATE OR REPLACE FUNCTION itap.segments_validate_conditions() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF NEW.kind = 'dynamic' AND NEW.conditions IS DISTINCT FROM '{}'::jsonb THEN
    PERFORM itap.lock_condition_segments(NEW.organization_id, NEW.conditions);
    PERFORM itap.validate_segment_conditions(NEW.organization_id, NEW.target, NEW.conditions, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
