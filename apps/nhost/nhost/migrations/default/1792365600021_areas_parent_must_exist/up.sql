-- A parent that is not found in the same organization and facility used to yield a silent root path (the FK then
-- accepted the row when the parent was inserted later in the same statement). It is rejected now.
CREATE OR REPLACE FUNCTION itap.areas_maintain_path() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  parent_path uuid[];
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.path := ARRAY[NEW.id];
  ELSE
    SELECT a.path INTO parent_path
    FROM itap.areas a
    WHERE a.organization_id = NEW.organization_id AND a.facility_id = NEW.facility_id AND a.id = NEW.parent_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'foreign_key_violation', MESSAGE = 'area_parent_not_found';
    END IF;
    IF NEW.id = ANY (parent_path) THEN
      PERFORM itap.raise_code('area_cycle');
    END IF;
    PERFORM 1 FROM itap.areas a WHERE a.id = ANY (parent_path) ORDER BY a.id FOR SHARE;
    NEW.path := parent_path || NEW.id;
  END IF;
  NEW.depth := cardinality(NEW.path) - 1;
  RETURN NEW;
END;
$$;
