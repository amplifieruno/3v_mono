DROP FUNCTION itap.facility_current_occupancy(itap.facilities);
CREATE OR REPLACE FUNCTION itap.area_current_occupancy(area_row itap.areas) RETURNS integer
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT 0;
$$;
