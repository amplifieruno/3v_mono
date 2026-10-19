-- True for a real calendar date in strict YYYY-MM-DD form (2024-02-29 yes, 2023-02-29 / 2024-13-45 / 'yesterday' no).
CREATE FUNCTION itap.is_valid_date(v text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  IF v IS NULL OR v !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN false;
  END IF;
  RETURN to_char(v::date, 'YYYY-MM-DD') = v;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$$;

-- BEFORE INSERT OR UPDATE trigger for tables with organization_id + custom_fields jsonb.
-- Usage: ... EXECUTE FUNCTION itap.validate_custom_fields('<entity>')  (entity = custom_attribute_entities.value).
-- Rules, against the organization's definitions for that entity:
--   * custom_fields must be a JSON object ('{}' is always valid unless a required definition exists);
--   * a key without any definition (active or not) is rejected; keys of inactive definitions are accepted unvalidated;
--   * every active required definition needs a non-null value;
--   * values must match data_type (string/number/boolean JSON types; date = real YYYY-MM-DD; enum = one of options);
--     null is accepted for optional keys.
-- On UPDATE nothing is checked unless custom_fields changed, so adding a required definition never blocks edits of
-- other columns on existing rows. Violations raise check_violation 'custom_field_invalid:<key>'
-- ('custom_field_invalid:custom_fields' when the value is not an object).
CREATE FUNCTION itap.validate_custom_fields() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  entity_key text := TG_ARGV[0];
  def itap.custom_attribute_definitions%ROWTYPE;
  fields jsonb := NEW.custom_fields;
  field_key text;
  val jsonb;
  valid boolean;
BEGIN
  IF entity_key IS NULL OR NOT EXISTS (SELECT 1 FROM itap.custom_attribute_entities WHERE value = entity_key) THEN
    RAISE EXCEPTION 'validate_custom_fields: unknown entity %', entity_key USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.custom_fields IS NOT DISTINCT FROM OLD.custom_fields THEN
    RETURN NEW;
  END IF;
  IF fields IS NULL OR jsonb_typeof(fields) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'custom_field_invalid:custom_fields';
  END IF;

  FOR field_key IN SELECT jsonb_object_keys(fields) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM itap.custom_attribute_definitions d
      WHERE d.organization_id = NEW.organization_id AND d.entity = entity_key AND d.key = field_key
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'custom_field_invalid:' || field_key;
    END IF;
  END LOOP;

  FOR def IN
    SELECT * FROM itap.custom_attribute_definitions d
    WHERE d.organization_id = NEW.organization_id AND d.entity = entity_key AND d.is_active
    ORDER BY d.key
  LOOP
    val := fields -> def.key;
    IF val IS NULL OR val = 'null'::jsonb THEN
      IF def.required THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'custom_field_invalid:' || def.key;
      END IF;
      CONTINUE;
    END IF;
    valid := CASE def.data_type
      WHEN 'string' THEN jsonb_typeof(val) = 'string'
      WHEN 'number' THEN jsonb_typeof(val) = 'number'
      WHEN 'boolean' THEN jsonb_typeof(val) = 'boolean'
      WHEN 'date' THEN jsonb_typeof(val) = 'string' AND itap.is_valid_date(val #>> '{}')
      WHEN 'enum' THEN jsonb_typeof(val) = 'string' AND COALESCE(def.options, '[]'::jsonb) @> jsonb_build_array(val)
      ELSE false
    END;
    IF NOT valid THEN
      RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'custom_field_invalid:' || def.key;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
