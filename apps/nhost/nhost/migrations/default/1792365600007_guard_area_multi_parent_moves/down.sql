DROP TRIGGER areas_single_parent_move ON itap.areas;
DROP FUNCTION itap.areas_single_parent_move();

CREATE OR REPLACE FUNCTION itap.areas_rewrite_subtree() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  UPDATE itap.areas d
  SET path = NEW.path || d.path[array_position(d.path, NEW.id) + 1:],
      depth = cardinality(NEW.path) + cardinality(d.path) - array_position(d.path, NEW.id) - 1
  WHERE d.path @> ARRAY[NEW.id] AND d.id <> NEW.id AND d.organization_id = NEW.organization_id;
  RETURN NULL;
END;
$$;
