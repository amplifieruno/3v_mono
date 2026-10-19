-- Result row type of itap.area_descendants. Never stores rows; tracked with the standard organization filter.
CREATE TABLE itap_results.area_refs (
  organization_id uuid NOT NULL,
  id uuid NOT NULL,
  facility_id uuid NOT NULL,
  parent_id uuid,
  name text NOT NULL,
  area_type text NOT NULL,
  access_level text NOT NULL,
  status text NOT NULL,
  depth integer NOT NULL
);

-- The subtree of p_area: the area itself and all its descendants (depth is absolute, as in itap.areas), ordered by
-- depth then name. Scoped to the session organization: an area of another organization (or an unknown id) yields no
-- rows; a session without x-hasura-organization-id raises organization_required.
CREATE FUNCTION itap.area_descendants(hasura_session json, p_area uuid) RETURNS SETOF itap_results.area_refs
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT a.organization_id, a.id, a.facility_id, a.parent_id, a.name, a.area_type, a.access_level, a.status, a.depth
  FROM itap.areas a
  WHERE a.organization_id = itap.session_organization(hasura_session)
    AND a.path @> ARRAY[p_area]
  ORDER BY a.depth, a.name;
$$;
