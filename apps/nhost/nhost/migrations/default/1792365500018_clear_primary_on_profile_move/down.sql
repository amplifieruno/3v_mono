CREATE OR REPLACE FUNCTION itap.identities_link() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  session_user_id text := nullif(current_setting('hasura.user', true), '')::jsonb ->> 'x-hasura-user-id';
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.profile_id IS NOT DISTINCT FROM OLD.profile_id THEN
    RETURN NEW;
  END IF;
  IF NEW.profile_id IS NULL THEN
    NEW.linked_at := NULL;
    NEW.linked_by := NULL;
    NEW.is_primary_for_profile := false;
  ELSE
    NEW.linked_at := now();
    SELECT m.user_id INTO NEW.linked_by
    FROM itap.organization_members m
    WHERE m.organization_id = NEW.organization_id
      AND session_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND m.user_id = session_user_id::uuid;
  END IF;
  RETURN NEW;
END;
$$;
