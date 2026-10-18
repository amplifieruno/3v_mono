-- Deactivation bookkeeping, so org_admin can deactivate/reactivate by setting status alone
-- (deactivated_at / deactivated_by are read-only in metadata).
-- deactivated_by = Hasura session user (null when unset, e.g. admin secret without a user id).
CREATE FUNCTION itap.organization_member_deactivation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_status text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END;
BEGIN
  IF NEW.status = 'deactivated' AND old_status IS DISTINCT FROM 'deactivated' THEN
    NEW.deactivated_at := coalesce(NEW.deactivated_at, now());
    NEW.deactivated_by := coalesce(
      NEW.deactivated_by,
      (nullif(current_setting('hasura.user', true), '')::jsonb ->> 'x-hasura-user-id')::uuid
    );
  ELSIF NEW.status <> 'deactivated' AND old_status = 'deactivated' THEN
    NEW.deactivated_at := NULL;
    NEW.deactivated_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organization_members_deactivation
  BEFORE INSERT OR UPDATE ON itap.organization_members
  FOR EACH ROW EXECUTE FUNCTION itap.organization_member_deactivation();
