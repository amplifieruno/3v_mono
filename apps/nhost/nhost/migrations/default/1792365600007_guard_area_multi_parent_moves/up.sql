-- One UPDATE statement that re-parents rows to different parents is rejected (area_multi_parent_move): row-level
-- BEFORE triggers would read parent paths that later rows of the same statement change, and the subtree rewrites
-- (row-level AFTER triggers) run only at statement end, so such a statement could form an undetected cycle or leave
-- stale paths. Moving several rows under the same parent stays allowed (the cycle check of the first moved ancestor
-- of that parent sees its true path). Hasura update_areas_many runs one statement per entry, so it is unaffected.
CREATE FUNCTION itap.areas_single_parent_move() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  -- Moving to the root (NULL) counts as one more distinct parent.
  IF (
    SELECT count(DISTINCT coalesce(n.parent_id::text, 'root'))
    FROM new_rows n JOIN old_rows o ON o.id = n.id
    WHERE n.parent_id IS DISTINCT FROM o.parent_id
  ) > 1 THEN
    PERFORM itap.raise_code('area_multi_parent_move');
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER areas_single_parent_move AFTER UPDATE ON itap.areas
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION itap.areas_single_parent_move();

-- Rewrite descendants from the moved row's current path (not NEW.path as captured when the row was processed).
CREATE OR REPLACE FUNCTION itap.areas_rewrite_subtree() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  moved_path uuid[];
BEGIN
  SELECT a.path INTO moved_path FROM itap.areas a WHERE a.id = NEW.id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  UPDATE itap.areas d
  SET path = moved_path || d.path[array_position(d.path, NEW.id) + 1:],
      depth = cardinality(moved_path) + cardinality(d.path) - array_position(d.path, NEW.id) - 1
  WHERE d.path @> ARRAY[NEW.id] AND d.id <> NEW.id AND d.organization_id = NEW.organization_id;
  RETURN NULL;
END;
$$;
