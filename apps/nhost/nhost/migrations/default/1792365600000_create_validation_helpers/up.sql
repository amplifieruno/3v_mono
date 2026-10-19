-- Shape validators for jsonb columns, used in CHECK constraints (spec §6.0). Both are IMMUTABLE, never raise, and
-- return false (not NULL) for a NULL argument: nullable columns say so explicitly, e.g.
-- CHECK (shape IS NULL OR itap.valid_shape(shape)).

-- Schedule windows (read by itap.in_windows): a JSON array (possibly empty) of objects with exactly the keys
--   days: non-empty array of integers 1..7 (ISO weekday; duplicates tolerated),
--   from: 'HH:MM' (00:00..23:59, two-digit hour),
--   to:   'HH:MM' or '24:00' (to < from is an overnight window; to = from is an empty window, as in_windows).
CREATE FUNCTION itap.valid_windows(windows jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  w jsonb;
  d jsonb;
  time_re constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
BEGIN
  IF windows IS NULL OR jsonb_typeof(windows) <> 'array' THEN
    RETURN false;
  END IF;
  FOR w IN SELECT e FROM jsonb_array_elements(windows) AS e LOOP
    IF jsonb_typeof(w) <> 'object' THEN
      RETURN false;
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(w) AS k WHERE k NOT IN ('days', 'from', 'to')) THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(w -> 'days') IS DISTINCT FROM 'array' THEN
      RETURN false;
    END IF;
    IF jsonb_array_length(w -> 'days') = 0 THEN
      RETURN false;
    END IF;
    FOR d IN SELECT e FROM jsonb_array_elements(w -> 'days') AS e LOOP
      IF jsonb_typeof(d) <> 'number' OR d::text !~ '^[1-7]$' THEN
        RETURN false;
      END IF;
    END LOOP;
    IF jsonb_typeof(w -> 'from') IS DISTINCT FROM 'string' OR jsonb_typeof(w -> 'to') IS DISTINCT FROM 'string' THEN
      RETURN false;
    END IF;
    IF (w ->> 'from') !~ time_re OR NOT ((w ->> 'to') ~ time_re OR (w ->> 'to') = '24:00') THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

-- A point in floor-plan pixel space: [x, y], two JSON numbers.
CREATE FUNCTION itap.valid_point(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog
AS $$
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' THEN
    RETURN false;
  END IF;
  RETURN jsonb_array_length(p) = 2
    AND jsonb_typeof(p -> 0) = 'number'
    AND jsonb_typeof(p -> 1) = 'number';
END;
$$;

-- Area / coverage shapes in floor-plan pixel space (GeoJSON-like), with exactly these keys:
--   {"type": "Polygon", "coordinates": [ring, ...]}: at least one ring (the first is the outline, the rest holes);
--     a ring is an array of points with at least 3 distinct positions (a closing point equal to the first is
--     optional and not counted);
--   {"type": "Circle", "center": [x, y], "radius": r}: r a number > 0.
CREATE FUNCTION itap.valid_shape(shape jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  ring jsonb;
  n int;
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
    n := jsonb_array_length(ring);
    IF n >= 2 AND ring -> 0 = ring -> (n - 1) THEN
      n := n - 1;
    END IF;
    IF n < 3 THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;
