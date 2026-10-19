-- Segment condition validation (language: migration *_create_segment_field_catalog). Raises
-- segment_condition_invalid:<path> at the first error; triggers on segments (dynamic) and segment_templates.
-- Referenced segments cannot be deleted (segment_referenced) while a segment or template condition names them.

-- Whether a JSON scalar is a valid value of the type (references: a uuid string; existence is checked separately).
CREATE FUNCTION itap.segment_value_valid(p_type text, v jsonb, p_enum text[]) RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  t constant text := jsonb_typeof(v);
BEGIN
  IF p_type IN ('date', 'timestamp') AND t = 'object' THEN
    IF (SELECT array_agg(k) FROM jsonb_object_keys(v) k) IS DISTINCT FROM ARRAY['relative_days']
       OR jsonb_typeof(v -> 'relative_days') <> 'number' THEN
      RETURN false;
    END IF;
    RETURN (v ->> 'relative_days')::numeric = trunc((v ->> 'relative_days')::numeric);
  END IF;
  CASE p_type
    WHEN 'boolean' THEN RETURN t = 'boolean';
    WHEN 'number' THEN RETURN t = 'number';
    WHEN 'integer' THEN
      IF t <> 'number' THEN RETURN false; END IF;
      RETURN (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric);
    ELSE
      IF t <> 'string' THEN RETURN false; END IF;
  END CASE;
  CASE p_type
    WHEN 'text' THEN RETURN btrim(v #>> '{}') <> '';
    WHEN 'enum' THEN RETURN (v #>> '{}') = ANY (p_enum);
    WHEN 'date' THEN RETURN itap.is_valid_date(v #>> '{}');
    WHEN 'timestamp' THEN
      IF (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}' THEN RETURN false; END IF;
      BEGIN
        PERFORM (v #>> '{}')::timestamptz;
        RETURN true;
      EXCEPTION WHEN OTHERS THEN
        RETURN false;
      END;
    ELSE -- company, work_schedule, area, segment: a uuid (existence: itap.segment_reference_valid)
      RETURN (v #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  END CASE;
END;
$$;

-- Comparable sort key of a valid value (between bounds); NULL when not comparable (mixed absolute/relative).
CREATE FUNCTION itap.segment_value_key(p_type text, v jsonb) RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_type IN ('integer', 'number') THEN (v #>> '{}')::numeric
    WHEN p_type IN ('date', 'timestamp') AND jsonb_typeof(v) = 'object' THEN NULL
    WHEN p_type = 'date' THEN ((v #>> '{}')::date - DATE '2000-01-01')::numeric
    WHEN p_type = 'timestamp' THEN extract(epoch FROM (v #>> '{}')::timestamptz)
  END;
$$;

-- Whether a valid value's referenced id exists in the organization (segment: manual, same target, not p_self);
-- true for non-reference types.
CREATE FUNCTION itap.segment_reference_valid(p_org uuid, p_target text, p_self uuid, p_type text, p_value jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  p_id uuid;
BEGIN
  IF p_type NOT IN ('company', 'work_schedule', 'area', 'segment') THEN
    RETURN true;
  END IF;
  p_id := (p_value #>> '{}')::uuid;
  RETURN CASE p_type
    WHEN 'company' THEN EXISTS (SELECT 1 FROM itap.companies c WHERE c.organization_id = p_org AND c.id = p_id)
    WHEN 'work_schedule' THEN EXISTS (SELECT 1 FROM itap.work_schedules s WHERE s.organization_id = p_org AND s.id = p_id)
    WHEN 'area' THEN EXISTS (SELECT 1 FROM itap.areas a WHERE a.organization_id = p_org AND a.id = p_id)
    WHEN 'segment' THEN p_id IS DISTINCT FROM p_self AND EXISTS (
      SELECT 1 FROM itap.segments s
      WHERE s.organization_id = p_org AND s.id = p_id AND s.kind = 'manual' AND s.target = p_target
    )
  END;
END;
$$;

-- Validates one node (recursive). p_catalog: field -> {"type", "operators", "enum"} of the target.
CREATE FUNCTION itap.validate_segment_node(
  p_org uuid, p_target text, p_self uuid, p_catalog jsonb, p_node jsonb, p_path text, p_depth integer
) RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  bad constant text := 'segment_condition_invalid:';
  keys text[];
  spec jsonb;
  vtype text;
  enum_values text[];
  op text;
  v jsonb;
  i integer;
  low numeric;
  high numeric;
BEGIN
  IF jsonb_typeof(p_node) IS DISTINCT FROM 'object' OR p_depth > 7 THEN
    PERFORM itap.raise_code(bad || p_path);
  END IF;
  SELECT array_agg(k ORDER BY k) INTO keys FROM jsonb_object_keys(p_node) k;
  IF p_node ? 'op' THEN
    IF keys IS DISTINCT FROM ARRAY['children', 'op'] THEN
      PERFORM itap.raise_code(bad || p_path);
    END IF;
    IF jsonb_typeof(p_node -> 'op') <> 'string' OR (p_node ->> 'op') NOT IN ('and', 'or', 'not') THEN
      PERFORM itap.raise_code(bad || p_path || '.op');
    END IF;
    IF jsonb_typeof(p_node -> 'children') <> 'array' THEN
      PERFORM itap.raise_code(bad || p_path || '.children');
    END IF;
    IF jsonb_array_length(p_node -> 'children') = 0
       OR (p_node ->> 'op' = 'not' AND jsonb_array_length(p_node -> 'children') <> 1) THEN
      PERFORM itap.raise_code(bad || p_path || '.children');
    END IF;
    FOR i IN 0 .. jsonb_array_length(p_node -> 'children') - 1 LOOP
      PERFORM itap.validate_segment_node(
        p_org, p_target, p_self, p_catalog, p_node -> 'children' -> i, p_path || '.children[' || i || ']', p_depth + 1
      );
    END LOOP;
    RETURN;
  END IF;

  IF keys IS DISTINCT FROM ARRAY['field', 'operator', 'value'] THEN
    PERFORM itap.raise_code(bad || p_path);
  END IF;
  spec := CASE WHEN jsonb_typeof(p_node -> 'field') = 'string' THEN p_catalog -> (p_node ->> 'field') END;
  IF spec IS NULL THEN
    PERFORM itap.raise_code(bad || p_path || '.field');
  END IF;
  vtype := spec ->> 'type';
  enum_values := CASE WHEN jsonb_typeof(spec -> 'enum') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(spec -> 'enum')) END;
  op := CASE WHEN jsonb_typeof(p_node -> 'operator') = 'string' THEN p_node ->> 'operator' END;
  IF op IS NULL OR NOT (spec -> 'operators') ? op THEN
    PERFORM itap.raise_code(bad || p_path || '.operator');
  END IF;
  v := p_node -> 'value';

  IF op = 'is_null' THEN
    IF jsonb_typeof(v) <> 'boolean' THEN
      PERFORM itap.raise_code(bad || p_path || '.value');
    END IF;
  ELSIF op IN ('in', 'nin') THEN
    IF jsonb_typeof(v) <> 'array' THEN
      PERFORM itap.raise_code(bad || p_path || '.value');
    END IF;
    IF jsonb_array_length(v) = 0 THEN
      PERFORM itap.raise_code(bad || p_path || '.value');
    END IF;
    FOR i IN 0 .. jsonb_array_length(v) - 1 LOOP
      IF NOT itap.segment_value_valid(vtype, v -> i, enum_values) THEN
        PERFORM itap.raise_code(bad || p_path || '.value[' || i || ']');
      END IF;
      IF NOT itap.segment_reference_valid(p_org, p_target, p_self, vtype, v -> i) THEN
        PERFORM itap.raise_code(bad || p_path || '.value[' || i || ']');
      END IF;
    END LOOP;
  ELSIF op = 'between' THEN
    IF jsonb_typeof(v) <> 'array' THEN
      PERFORM itap.raise_code(bad || p_path || '.value');
    END IF;
    IF jsonb_array_length(v) <> 2 THEN
      PERFORM itap.raise_code(bad || p_path || '.value');
    END IF;
    IF NOT itap.segment_value_valid(vtype, v -> 0, enum_values) OR NOT itap.segment_value_valid(vtype, v -> 1, enum_values) THEN
      PERFORM itap.raise_code(bad || p_path || '.value');
    END IF;
    low := coalesce(itap.segment_value_key(vtype, v -> 0), (v -> 0 ->> 'relative_days')::numeric);
    high := coalesce(itap.segment_value_key(vtype, v -> 1), (v -> 1 ->> 'relative_days')::numeric);
    IF (jsonb_typeof(v -> 0) = 'object') = (jsonb_typeof(v -> 1) = 'object') AND low > high THEN
      PERFORM itap.raise_code(bad || p_path || '.value');
    END IF;
  ELSE
    IF NOT itap.segment_value_valid(vtype, v, enum_values) THEN
      PERFORM itap.raise_code(bad || p_path || '.value');
    END IF;
    IF NOT itap.segment_reference_valid(p_org, p_target, p_self, vtype, v) THEN
      PERFORM itap.raise_code(bad || p_path || '.value');
    END IF;
  END IF;
END;
$$;

-- Public entry point (also for the backend translator's pre-check). p_segment: the segment being saved (a segment
-- never references itself).
CREATE FUNCTION itap.validate_segment_conditions(p_org uuid, p_target text, p_conditions jsonb, p_segment uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  catalog jsonb;
BEGIN
  IF p_target IS NULL OR p_target NOT IN ('identities', 'profiles') THEN
    PERFORM itap.raise_code('segment_target_invalid');
  END IF;
  SELECT jsonb_object_agg(c.field, jsonb_build_object('type', c.value_type, 'operators', to_jsonb(c.operators), 'enum', to_jsonb(c.enum_values)))
  INTO catalog
  FROM itap.segment_field_catalog(p_target, p_org) c;
  PERFORM itap.validate_segment_node(p_org, p_target, p_segment, catalog, p_conditions, '$', 1);
END;
$$;

-- Segments: dynamic conditions only ('{}' is left to the CHECK segments_conditions_match_kind).
CREATE FUNCTION itap.segments_validate_conditions() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF NEW.kind = 'dynamic' AND NEW.conditions IS DISTINCT FROM '{}'::jsonb THEN
    PERFORM itap.validate_segment_conditions(NEW.organization_id, NEW.target, NEW.conditions, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER segments_validate_conditions BEFORE INSERT OR UPDATE OF conditions, kind, target ON itap.segments
  FOR EACH ROW EXECUTE FUNCTION itap.segments_validate_conditions();

CREATE FUNCTION itap.segment_templates_validate_conditions() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  PERFORM itap.validate_segment_conditions(NEW.organization_id, NEW.target, NEW.conditions);
  RETURN NEW;
END;
$$;
CREATE TRIGGER segment_templates_validate_conditions BEFORE INSERT OR UPDATE OF conditions, target ON itap.segment_templates
  FOR EACH ROW EXECUTE FUNCTION itap.segment_templates_validate_conditions();

-- Segment ids named by member_of_segment leaves of (valid) conditions.
CREATE FUNCTION itap.segment_condition_segment_ids(p_conditions jsonb) RETURNS uuid[]
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(array_agg(DISTINCT (x #>> '{}')::uuid), '{}')
  FROM jsonb_path_query(p_conditions, 'strict $.** ? (@.field == "member_of_segment").value') v,
       jsonb_path_query(v, 'lax $[*]') x;
$$;

CREATE FUNCTION itap.segments_guard_referenced() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  -- Organization delete cascade: everything goes.
  IF NOT EXISTS (SELECT 1 FROM itap.organizations o WHERE o.id = OLD.organization_id) THEN
    RETURN OLD;
  END IF;
  IF EXISTS (
    SELECT 1 FROM itap.segments s
    WHERE s.organization_id = OLD.organization_id AND s.kind = 'dynamic' AND s.id <> OLD.id
      AND OLD.id = ANY (itap.segment_condition_segment_ids(s.conditions))
  ) OR EXISTS (
    SELECT 1 FROM itap.segment_templates t
    WHERE t.organization_id = OLD.organization_id AND OLD.id = ANY (itap.segment_condition_segment_ids(t.conditions))
  ) THEN
    PERFORM itap.raise_code('segment_referenced');
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER segments_guard_referenced BEFORE DELETE ON itap.segments
  FOR EACH ROW EXECUTE FUNCTION itap.segments_guard_referenced();
