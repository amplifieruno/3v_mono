-- Slice 10 task 3: erased profiles are kept as tombstones (audit / FK integrity: requests, policy versions,
-- redacted audit rows keep pointing at them).
-- * profiles.erased_at: set by the DSR erasure (itap.dsr_erase, under itap.retention_context) together with the
--   anonymized columns; read-only for org_admin.
-- * profiles_erased_guard: every writer (admin secret and SQL included) is refused changing erased_at or any column of
--   an erased profile outside the retention context (profile_erased): a tombstone never regains personal data and its
--   processing restriction is never lifted.
-- * validate_custom_fields: skipped under the retention context (anonymization empties custom fields even where a
--   definition requires one).

ALTER TABLE itap.profiles ADD COLUMN erased_at timestamptz;

CREATE FUNCTION itap.profiles_erased_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF itap.retention_context() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.erased_at IS NOT NULL THEN
      PERFORM itap.raise_code('profile_erasure_function_only');
    END IF;
  ELSIF OLD.erased_at IS NOT NULL THEN
    PERFORM itap.raise_code('profile_erased');
  ELSIF NEW.erased_at IS NOT NULL THEN
    PERFORM itap.raise_code('profile_erasure_function_only');
  END IF;
  RETURN NEW;
END;
$$;
-- Name sorts before profiles_restriction_guard: an erased profile reports profile_erased.
CREATE TRIGGER profiles_erased_guard BEFORE INSERT OR UPDATE ON itap.profiles
  FOR EACH ROW EXECUTE FUNCTION itap.profiles_erased_guard();

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
  -- Retention anonymization / DSR erasure empties custom fields even where a definition requires one.
  IF itap.retention_context() THEN
    RETURN NEW;
  END IF;
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
