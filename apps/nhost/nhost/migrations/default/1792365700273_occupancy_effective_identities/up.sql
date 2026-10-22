-- Occupancy computed fields count people like facility_occupancy_now (1792365700118): distinct effective
-- identities. A merged source keeps its area_occupancy row until its session closes and is the same person as
-- its merge target, so counting rows counted that person twice; the area tree, the floor plan and the
-- facility list now agree with facility_occupancy_now.
CREATE OR REPLACE FUNCTION itap.area_current_occupancy(area_row itap.areas) RETURNS integer
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT count(DISTINCT itap.effective_identity(o.organization_id, o.identity_id))::integer
  FROM itap.area_occupancy o
  JOIN itap.areas a ON a.organization_id = o.organization_id AND a.facility_id = o.facility_id AND a.id = o.area_id
  WHERE o.organization_id = area_row.organization_id AND o.facility_id = area_row.facility_id
    AND a.path @> ARRAY[area_row.id];
$$;

CREATE OR REPLACE FUNCTION itap.facility_current_occupancy(facility_row itap.facilities) RETURNS integer
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT count(DISTINCT itap.effective_identity(o.organization_id, o.identity_id))::integer
  FROM itap.area_occupancy o
  JOIN itap.areas a ON a.organization_id = o.organization_id AND a.facility_id = o.facility_id AND a.id = o.area_id
  WHERE o.organization_id = facility_row.organization_id AND o.facility_id = facility_row.id;
$$;
