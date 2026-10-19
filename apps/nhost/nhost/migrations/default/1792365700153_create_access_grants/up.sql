-- One-time and time-bound access grants (spec §6.13, SA_5 §2.1.4): a profile may pass one area (subtree) or one
-- access point between valid_from and valid_until. org_admin inserts and reads; nobody edits a grant:
--   granted_by  stamped from the session member (read-only);
--   used_at     set once, by check_access (slice 8 task 2) under a row lock, only on single_use grants;
--   revoked_*   set once, only by revoke_access_grant (transaction-local flag itap.access_grant_context).
-- A grant that was used is never deleted (decisions reference it); an unused one may be removed by SQL only.
CREATE TABLE itap.access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  area_id uuid,
  access_point_id uuid,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  single_use boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  reason text,
  granted_by uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_grants_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT access_grants_exactly_one_target CHECK (num_nonnulls(area_id, access_point_id) = 1),
  CONSTRAINT access_grants_valid_window CHECK (valid_from < valid_until),
  CONSTRAINT access_grants_used_single_use CHECK (used_at IS NULL OR single_use),
  CONSTRAINT access_grants_revoked_consistent CHECK (revoked_at IS NOT NULL OR (revoked_by IS NULL AND revoke_reason IS NULL)),
  CONSTRAINT access_grants_profile_fkey FOREIGN KEY (organization_id, profile_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT access_grants_area_fkey FOREIGN KEY (organization_id, area_id)
    REFERENCES itap.areas (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT access_grants_access_point_fkey FOREIGN KEY (organization_id, access_point_id)
    REFERENCES itap.access_points (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT access_grants_granted_by_fkey FOREIGN KEY (organization_id, granted_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT access_grants_revoked_by_fkey FOREIGN KEY (organization_id, revoked_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX access_grants_organization_id_profile_id_valid_until_idx
  ON itap.access_grants (organization_id, profile_id, valid_until);
CREATE INDEX access_grants_organization_id_area_id_idx ON itap.access_grants (organization_id, area_id);
CREATE INDEX access_grants_organization_id_access_point_id_idx ON itap.access_grants (organization_id, access_point_id);
CREATE INDEX access_grants_organization_id_granted_by_idx ON itap.access_grants (organization_id, granted_by);
CREATE INDEX access_grants_organization_id_revoked_by_idx ON itap.access_grants (organization_id, revoked_by);

-- Grants are immutable except for the two one-way system writes (used_at; revocation via the function).
CREATE FUNCTION itap.guard_access_grant() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  in_revoke boolean := coalesce(current_setting('itap.access_grant_context', true), '') = 'on';
  fixed text[] := ARRAY['used_at', 'revoked_at', 'revoked_by', 'revoke_reason', 'updated_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.used_at IS NOT NULL AND EXISTS (SELECT 1 FROM itap.organizations o WHERE o.id = OLD.organization_id) THEN
      PERFORM itap.raise_code('access_grant_used');
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.used_at IS NOT NULL OR NEW.revoked_at IS NOT NULL THEN
      PERFORM itap.raise_code('access_grant_not_editable');
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - fixed) IS DISTINCT FROM (to_jsonb(OLD) - fixed)
     OR (OLD.used_at IS NOT NULL AND NEW.used_at IS DISTINCT FROM OLD.used_at)
     OR (OLD.revoked_at IS NOT NULL AND (NEW.revoked_at, NEW.revoked_by, NEW.revoke_reason)
         IS DISTINCT FROM (OLD.revoked_at, OLD.revoked_by, OLD.revoke_reason))
     OR (NOT in_revoke AND (NEW.revoked_at, NEW.revoked_by, NEW.revoke_reason)
         IS DISTINCT FROM (OLD.revoked_at, OLD.revoked_by, OLD.revoke_reason)) THEN
    PERFORM itap.raise_code('access_grant_not_editable');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER access_grants_guard BEFORE INSERT OR UPDATE OR DELETE ON itap.access_grants
  FOR EACH ROW EXECUTE FUNCTION itap.guard_access_grant();
CREATE TRIGGER access_grants_stamp_granted_by BEFORE INSERT ON itap.access_grants
  FOR EACH ROW EXECUTE FUNCTION itap.stamp_session_member('granted_by');
CREATE TRIGGER access_grants_set_updated_at BEFORE UPDATE ON itap.access_grants
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.access_grants
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

-- Tracked mutation (org_admin): revokes a grant once (access_grant_revoked when already revoked).
CREATE FUNCTION itap.revoke_access_grant(hasura_session json, p_grant uuid, p_reason text DEFAULT NULL)
RETURNS SETOF itap.access_grants
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.organization_member(org, itap.session_user_id(hasura_session));
  revoked timestamptz;
BEGIN
  SELECT revoked_at INTO revoked FROM itap.access_grants WHERE organization_id = org AND id = p_grant FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('access_grant_not_found');
  END IF;
  IF revoked IS NOT NULL THEN
    PERFORM itap.raise_code('access_grant_revoked');
  END IF;
  PERFORM set_config('itap.access_grant_context', 'on', true);
  UPDATE itap.access_grants
  SET revoked_at = now(), revoked_by = actor, revoke_reason = nullif(btrim(coalesce(p_reason, '')), '')
  WHERE organization_id = org AND id = p_grant;
  PERFORM set_config('itap.access_grant_context', 'off', true);
  RETURN QUERY SELECT * FROM itap.access_grants WHERE organization_id = org AND id = p_grant;
END;
$$;
