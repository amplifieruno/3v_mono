CREATE OR REPLACE FUNCTION itap.access_credentials_withdrawn() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
  flag text := 'itap.policy_withdrawn_' || replace(org::text, '-', '');
BEGIN
  IF coalesce(current_setting(flag, true), '') = 'on' THEN
    RETURN NULL;
  END IF;
  IF TG_TABLE_NAME = 'watch_list_entries' THEN
    IF NOT EXISTS (
      SELECT 1 FROM itap.watch_lists l
      WHERE l.organization_id = org AND l.id = (to_jsonb(NEW) ->> 'watch_list_id')::uuid AND l.kind = 'blacklist'
    ) THEN
      RETURN NULL;
    END IF;
  END IF;
  -- Organization cascade: nothing to distribute.
  IF NOT EXISTS (SELECT 1 FROM itap.organizations o WHERE o.id = org) THEN
    RETURN NULL;
  END IF;
  PERFORM itap.bump_policy_epoch(org, true);
  PERFORM set_config(flag, 'on', true);
  RETURN NULL;
END;
$$;

DROP FUNCTION itap.enforced_subject_exists(uuid, text, uuid);
