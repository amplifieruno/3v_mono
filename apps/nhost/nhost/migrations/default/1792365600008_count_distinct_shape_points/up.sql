-- valid_shape: a ring needs at least 3 DISTINCT points (previously only a closing point was discounted).
-- Area / coverage shapes in floor-plan pixel space (GeoJSON-like), with exactly these keys:
--   {"type": "Polygon", "coordinates": [ring, ...]}: at least one ring (the first is the outline, the rest holes);
--     a ring is an array of points with at least 3 distinct positions (repeated points, e.g. a closing point
--     equal to the first, are allowed and not counted);
--   {"type": "Circle", "center": [x, y], "radius": r}: r a number > 0.
CREATE OR REPLACE FUNCTION itap.valid_shape(shape jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  ring jsonb;
BEGIN
  IF shape IS NULL OR jsonb_typeof(shape) <> 'object' THEN
    RETURN false;
  END IF;
  IF shape ->> 'type' = 'Circle' THEN
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(shape) AS k WHERE k NOT IN ('type', 'center', 'radius')) THEN
      RETURN false;
    END IF;
    IF NOT itap.valid_point(shape -> 'center') OR jsonb_typeof(shape -> 'radius') IS DISTINCT FROM 'number' THEN
      RETURN false;
    END IF;
    RETURN (shape ->> 'radius')::numeric > 0;
  END IF;

  IF shape ->> 'type' IS DISTINCT FROM 'Polygon' THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(shape) AS k WHERE k NOT IN ('type', 'coordinates')) THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(shape -> 'coordinates') IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(shape -> 'coordinates') = 0 THEN
    RETURN false;
  END IF;
  FOR ring IN SELECT e FROM jsonb_array_elements(shape -> 'coordinates') AS e LOOP
    IF jsonb_typeof(ring) <> 'array' THEN
      RETURN false;
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(ring) AS p WHERE NOT itap.valid_point(p)) THEN
      RETURN false;
    END IF;
    IF (SELECT count(DISTINCT p) FROM jsonb_array_elements(ring) AS p) < 3 THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;
