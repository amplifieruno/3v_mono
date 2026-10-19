-- itap.apply_facility_template (spec §8.1 mutation functions, §8.5 apply_facility_template): creates the area tree of a
-- facility template inside a facility, atomically (one function call = one transaction; any failure creates nothing).
-- Tracked as a Hasura mutation for org_admin (session argument hasura_session); no backend action is needed.
--
-- * The template, the facility and the optional parent area are resolved inside the session organization only;
--   unknown or foreign ids raise facility_template_not_found / facility_not_found / parent_area_not_found.
--   The parent area must belong to the target facility.
-- * structure (validated by the facility_templates CHECK, itap.valid_template_structure) is a non-empty array of
--   root nodes {name, area_type, access_level?, capacity?, children?}. Roots become children of p_parent_area (or
--   facility roots when it is null). access_level defaults to the column default (public); capacity is a JSON
--   number holding an integer (40.0 allowed), cast with ::numeric::int.
-- * Names may collide with existing siblings: area names carry no unique constraint (applying a template twice
--   creates a second copy).
-- * Returns the created areas in pre-order (each node before its children, siblings in template order).
-- * path/depth come from areas_maintain_path; audit rows come from the areas audit trigger, whose actor is the
--   Hasura session user (hasura.user), i.e. the caller.

-- Internal (not tracked): inserts nodes under p_parent and returns them in pre-order.
CREATE FUNCTION itap.insert_template_nodes(p_organization uuid, p_facility uuid, p_parent uuid, p_nodes jsonb)
RETURNS SETOF itap.areas
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  node jsonb;
  created itap.areas;
BEGIN
  FOR node IN SELECT e FROM jsonb_array_elements(p_nodes) WITH ORDINALITY AS t (e, ord) ORDER BY ord LOOP
    INSERT INTO itap.areas (organization_id, facility_id, parent_id, name, area_type, access_level, capacity)
    VALUES (
      p_organization, p_facility, p_parent,
      node ->> 'name',
      node ->> 'area_type',
      coalesce(node ->> 'access_level', 'public'),
      (node ->> 'capacity')::numeric::int
    )
    RETURNING * INTO created;
    RETURN NEXT created;
    IF node ? 'children' THEN
      RETURN QUERY SELECT * FROM itap.insert_template_nodes(p_organization, p_facility, created.id, node -> 'children');
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION itap.apply_facility_template(
  hasura_session json, p_template uuid, p_facility uuid, p_parent_area uuid DEFAULT NULL
) RETURNS SETOF itap.areas
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  tpl jsonb;
BEGIN
  SELECT t.structure INTO tpl FROM itap.facility_templates t WHERE t.organization_id = org AND t.id = p_template;
  IF NOT FOUND THEN PERFORM itap.raise_code('facility_template_not_found'); END IF;
  -- Redundant with the CHECK; guards against a structure written while the check was not enforced.
  IF NOT itap.valid_template_structure(tpl) THEN PERFORM itap.raise_code('facility_template_invalid'); END IF;

  PERFORM 1 FROM itap.facilities f WHERE f.organization_id = org AND f.id = p_facility;
  IF NOT FOUND THEN PERFORM itap.raise_code('facility_not_found'); END IF;

  IF p_parent_area IS NOT NULL THEN
    PERFORM 1 FROM itap.areas a WHERE a.organization_id = org AND a.facility_id = p_facility AND a.id = p_parent_area;
    IF NOT FOUND THEN PERFORM itap.raise_code('parent_area_not_found'); END IF;
  END IF;

  RETURN QUERY SELECT * FROM itap.insert_template_nodes(org, p_facility, p_parent_area, tpl);
END;
$$;
