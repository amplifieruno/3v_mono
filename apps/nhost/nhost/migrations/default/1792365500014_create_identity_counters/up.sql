-- Profile link bookkeeping on identities and the stored profiles.identities_count counter (§8.1).

-- BEFORE trigger: a changed profile_id stamps linked_at / linked_by (the Hasura session user when it is a member of
-- the organization, else null); unlinking clears them and the primary flag. Also runs for the FK's
-- ON DELETE SET NULL (profile_id), so deleting a profile cannot leave a primary flag behind.
CREATE FUNCTION itap.identities_link() RETURNS trigger
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

CREATE TRIGGER identities_link BEFORE INSERT OR UPDATE ON itap.identities
  FOR EACH ROW EXECUTE FUNCTION itap.identities_link();

-- AFTER trigger: keeps profiles.identities_count equal to the number of identities linked to the profile.
CREATE FUNCTION itap.identities_count_profiles() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.profile_id IS NOT NULL
     AND (TG_OP = 'DELETE' OR NEW.profile_id IS DISTINCT FROM OLD.profile_id) THEN
    UPDATE itap.profiles SET identities_count = identities_count - 1
    WHERE organization_id = OLD.organization_id AND id = OLD.profile_id;
  END IF;
  IF TG_OP IN ('UPDATE', 'INSERT') AND NEW.profile_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.profile_id IS DISTINCT FROM OLD.profile_id) THEN
    UPDATE itap.profiles SET identities_count = identities_count + 1
    WHERE organization_id = NEW.organization_id AND id = NEW.profile_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER identities_count_profiles AFTER INSERT OR UPDATE OR DELETE ON itap.identities
  FOR EACH ROW EXECUTE FUNCTION itap.identities_count_profiles();

-- identities_count is a system counter: counter-only profile updates write no audit row.
DROP TRIGGER audit ON itap.profiles;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.profiles
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change('ignore:identities_count');
