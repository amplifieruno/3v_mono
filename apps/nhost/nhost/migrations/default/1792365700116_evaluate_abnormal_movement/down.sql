CREATE OR REPLACE FUNCTION itap.evaluate_abnormal_movement(p_location itap.identity_locations, p_base itap.events)
RETURNS SETOF uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT NULL::uuid WHERE false;
$$;
