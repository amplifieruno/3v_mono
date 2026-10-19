-- Restores the body of 1792365700140_create_dashboards.
CREATE OR REPLACE FUNCTION itap.valid_dashboard_widgets(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  w jsonb;
  pos jsonb;
  ids text[] := '{}';
  sources jsonb := itap.dashboard_widget_queries();
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) > 50 THEN
    RETURN false;
  END IF;
  FOR w IN SELECT e FROM jsonb_array_elements(p) e LOOP
    IF jsonb_typeof(w) <> 'object'
       OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(w) k)
          IS DISTINCT FROM ARRAY['id', 'kind', 'params', 'position', 'query', 'title'] THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(w -> 'id') <> 'string' OR length(w ->> 'id') NOT BETWEEN 1 AND 64 OR (w ->> 'id') = ANY (ids) THEN
      RETURN false;
    END IF;
    ids := ids || (w ->> 'id');
    IF jsonb_typeof(w -> 'kind') <> 'string' OR NOT sources ? (w ->> 'kind')
       OR jsonb_typeof(w -> 'query') <> 'string' OR NOT (sources -> (w ->> 'kind')) ? (w ->> 'query') THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(w -> 'title') <> 'string' OR btrim(w ->> 'title') = '' OR length(w ->> 'title') > 200 THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(w -> 'params') <> 'object' THEN
      RETURN false;
    END IF;
    pos := w -> 'position';
    IF jsonb_typeof(pos) <> 'object'
       OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(pos) k) IS DISTINCT FROM ARRAY['h', 'w', 'x', 'y']
       OR NOT itap.jsonb_int_between(pos -> 'x', 0, 11) OR NOT itap.jsonb_int_between(pos -> 'w', 1, 12)
       OR NOT itap.jsonb_int_between(pos -> 'y', 0, 1000) OR NOT itap.jsonb_int_between(pos -> 'h', 1, 24)
       OR (pos ->> 'x')::integer + (pos ->> 'w')::integer > 12 THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;
