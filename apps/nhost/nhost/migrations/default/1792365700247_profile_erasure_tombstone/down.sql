DROP TRIGGER profiles_erased_guard ON itap.profiles;
DROP FUNCTION itap.profiles_erased_guard();
ALTER TABLE itap.profiles DROP COLUMN erased_at;

CREATE OR REPLACE FUNCTION itap.validate_custom_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
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
$function$;
