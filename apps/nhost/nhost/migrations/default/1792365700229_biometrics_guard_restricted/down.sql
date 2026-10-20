-- Previous definition (1792365500031_guard_identity_biometric_inserts).
CREATE OR REPLACE FUNCTION itap.identity_biometrics_insert_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  identity_status text;
  identity_matching boolean;
BEGIN
  IF current_setting('itap.merge_context', true) = 'on' THEN
    RETURN NEW;
  END IF;
  SELECT status, matching_enabled INTO identity_status, identity_matching
  FROM itap.identities WHERE organization_id = NEW.organization_id AND id = NEW.identity_id;
  IF identity_status = 'merged' THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'identity_merged_frozen';
  END IF;
  IF identity_matching = false THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'identity_matching_disabled';
  END IF;
  RETURN NEW;
END;
$function$
;
