DROP TRIGGER access_credentials_withdrawn ON itap.areas;
DROP TRIGGER access_credentials_withdrawn_delete ON itap.segment_members;
CREATE CONSTRAINT TRIGGER access_credentials_withdrawn_delete AFTER DELETE ON itap.segment_members
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION itap.access_credentials_withdrawn();
DROP TRIGGER access_credentials_granted_reopen ON itap.segment_members;
DROP TRIGGER access_credentials_granted ON itap.profiles;
DROP TRIGGER access_credentials_granted_update ON itap.identities;
DROP TRIGGER access_credentials_granted ON itap.identities;
DROP TRIGGER access_credentials_withdrawn_delete ON itap.identities;
DROP TRIGGER access_credentials_withdrawn ON itap.identities;

CREATE OR REPLACE FUNCTION itap.access_credentials_granted()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  flag text := 'itap.policy_granted_' || replace(NEW.organization_id::text, '-', '');
BEGIN
  IF coalesce(current_setting(flag, true), '') = 'on' THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM itap.organizations x WHERE x.id = NEW.organization_id)
     OR NOT itap.enforced_subject_exists(NEW.organization_id, 'segment', NEW.segment_id) THEN
    RETURN NULL;
  END IF;
  PERFORM itap.bump_policy_epoch(NEW.organization_id, false);
  PERFORM set_config(flag, 'on', true);
  RETURN NULL;
END;
$function$

;
