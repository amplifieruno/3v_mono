CREATE OR REPLACE FUNCTION itap.area_current_occupancy(area_row itap.areas) RETURNS integer
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT count(*)::integer
  FROM itap.area_occupancy o
  JOIN itap.areas a ON a.organization_id = o.organization_id AND a.facility_id = o.facility_id AND a.id = o.area_id
  WHERE o.organization_id = area_row.organization_id AND o.facility_id = area_row.facility_id
    AND a.path @> ARRAY[area_row.id];
$$;

CREATE OR REPLACE FUNCTION itap.facility_current_occupancy(facility_row itap.facilities) RETURNS integer
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT count(*)::integer FROM itap.area_occupancy o
  WHERE o.organization_id = facility_row.organization_id AND o.facility_id = facility_row.id;
$$;
