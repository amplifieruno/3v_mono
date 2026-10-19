-- Structure of a facility template (spec §6.6): a non-empty JSON array of root nodes
--   {name, area_type, access_level?, capacity?, children?}
-- where children is again an array of nodes. area_type / access_level must be existing enum values, capacity a
-- non-negative integer, name a non-blank string (<= 200 chars), no other keys. At most 6 levels and 200 nodes.
-- itap.template_node_count returns the number of nodes of a valid (sub)tree, or -1 when it is invalid.
-- STABLE (reads the enum tables), not IMMUTABLE.
CREATE FUNCTION itap.template_node_count(nodes jsonb, level integer) RETURNS integer
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  n jsonb;
  total integer := 0;
  sub integer;
BEGIN
  IF nodes IS NULL OR jsonb_typeof(nodes) <> 'array' OR level > 6 THEN
    RETURN -1;
  END IF;
  FOR n IN SELECT e FROM jsonb_array_elements(nodes) AS e LOOP
    IF jsonb_typeof(n) <> 'object'
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(n) AS k
         WHERE k NOT IN ('name', 'area_type', 'access_level', 'capacity', 'children')
       )
       OR jsonb_typeof(n -> 'name') IS DISTINCT FROM 'string'
       OR btrim(n ->> 'name') = '' OR char_length(n ->> 'name') > 200
       OR jsonb_typeof(n -> 'area_type') IS DISTINCT FROM 'string'
       OR NOT EXISTS (SELECT 1 FROM itap.area_types t WHERE t.value = n ->> 'area_type')
    THEN
      RETURN -1;
    END IF;
    IF n ? 'access_level' AND (
         jsonb_typeof(n -> 'access_level') <> 'string'
         OR NOT EXISTS (SELECT 1 FROM itap.area_access_levels l WHERE l.value = n ->> 'access_level')
       )
    THEN
      RETURN -1;
    END IF;
    IF n ? 'capacity' AND (
         jsonb_typeof(n -> 'capacity') <> 'number'
         OR (n ->> 'capacity')::numeric < 0
         OR (n ->> 'capacity')::numeric <> trunc((n ->> 'capacity')::numeric)
         OR (n ->> 'capacity')::numeric > 2147483647
       )
    THEN
      RETURN -1;
    END IF;
    total := total + 1;
    IF n ? 'children' THEN
      sub := itap.template_node_count(n -> 'children', level + 1);
      IF sub < 0 THEN
        RETURN -1;
      END IF;
      total := total + sub;
    END IF;
    IF total > 200 THEN
      RETURN -1;
    END IF;
  END LOOP;
  RETURN total;
END;
$$;

CREATE FUNCTION itap.valid_template_structure(structure jsonb) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT itap.template_node_count(structure, 1) BETWEEN 1 AND 200;
$$;

CREATE TABLE itap.facility_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  structure jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facility_templates_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT facility_templates_organization_id_name_key UNIQUE (organization_id, name),
  CONSTRAINT facility_templates_structure_valid CHECK (itap.valid_template_structure(structure))
);

CREATE TRIGGER facility_templates_set_updated_at BEFORE UPDATE ON itap.facility_templates
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.facility_templates
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
