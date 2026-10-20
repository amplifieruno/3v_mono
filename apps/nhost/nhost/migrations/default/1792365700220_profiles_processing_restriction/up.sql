-- Restriction of processing (GDPR Art. 18; spec §6.14 DSR restriction; slice 10 task 1, Review Focus 3).
-- profiles.processing_restricted (+ restricted_at / restricted_by / restriction_reason, read-only) is changed only
-- by itap.apply_processing_restriction (transaction-local flag itap.restriction_context), called by the org_admin
-- function set_processing_restriction (audited: 'restrict' / 'unrestrict' rows with the reason) and by the DSR job
-- (task 3). Every other writer (GraphQL, admin secret, SQL) is refused. Effects (separate migrations): excluded from
-- match_face (recognition, enrollment duplicates), the face auth population, search and dynamic segments; nothing is
-- deleted. While restricted, the person's identities cannot be linked to or unlinked from the profile (an unlinked
-- identity would be matchable again; a new link would be new processing), outside the restriction context.
ALTER TABLE itap.profiles
  ADD COLUMN processing_restricted boolean NOT NULL DEFAULT false,
  ADD COLUMN restricted_at timestamptz,
  ADD COLUMN restricted_by uuid,
  ADD COLUMN restriction_reason text,
  ADD CONSTRAINT profiles_restriction_consistent CHECK (
    processing_restricted = (restricted_at IS NOT NULL)
    AND processing_restricted = (restriction_reason IS NOT NULL)
    AND (processing_restricted OR restricted_by IS NULL)),
  ADD CONSTRAINT profiles_restricted_by_fkey FOREIGN KEY (organization_id, restricted_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION;
CREATE INDEX profiles_organization_id_restricted_by_idx ON itap.profiles (organization_id, restricted_by);
CREATE INDEX profiles_restricted_idx ON itap.profiles (organization_id) WHERE processing_restricted;

INSERT INTO itap.audit_actions (value, description) VALUES
  ('restrict', 'Processing of a person restricted'),
  ('unrestrict', 'Processing restriction lifted');

CREATE FUNCTION itap.profiles_restriction_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF current_setting('itap.restriction_context', true) IS NOT DISTINCT FROM 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.processing_restricted OR NEW.restricted_at IS NOT NULL OR NEW.restricted_by IS NOT NULL
       OR NEW.restriction_reason IS NOT NULL THEN
      PERFORM itap.raise_code('processing_restriction_function_only');
    END IF;
  ELSIF NEW.processing_restricted IS DISTINCT FROM OLD.processing_restricted
     OR NEW.restricted_at IS DISTINCT FROM OLD.restricted_at
     OR NEW.restricted_by IS DISTINCT FROM OLD.restricted_by
     OR NEW.restriction_reason IS DISTINCT FROM OLD.restriction_reason THEN
    PERFORM itap.raise_code('processing_restriction_function_only');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER profiles_restriction_guard BEFORE INSERT OR UPDATE ON itap.profiles
  FOR EACH ROW EXECUTE FUNCTION itap.profiles_restriction_guard();

CREATE FUNCTION itap.identities_restricted_link() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF current_setting('itap.restriction_context', true) IS NOT DISTINCT FROM 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.profile_id IS NOT DISTINCT FROM OLD.profile_id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM itap.profiles p
    WHERE p.organization_id = NEW.organization_id AND p.processing_restricted
      AND p.id IN (NEW.profile_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.profile_id END)
  ) THEN
    PERFORM itap.raise_code('profile_processing_restricted');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER identities_restricted_link BEFORE INSERT OR UPDATE OF profile_id ON itap.identities
  FOR EACH ROW EXECUTE FUNCTION itap.identities_restricted_link();

-- Sets or lifts the restriction (internal; admin-only callers: set_processing_restriction, the DSR job). Locks the
-- profile row; idempotent (same state = no change, no audit row); reason required either way.
CREATE FUNCTION itap.apply_processing_restriction(p_org uuid, p_profile uuid, p_restricted boolean, p_reason text, p_actor uuid)
RETURNS itap.profiles
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  prof itap.profiles;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF p_restricted IS NULL THEN
    PERFORM itap.raise_code('processing_restriction_state_required');
  END IF;
  SELECT * INTO prof FROM itap.profiles p WHERE p.organization_id = p_org AND p.id = p_profile FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('profile_not_found');
  END IF;
  IF reason IS NULL THEN
    PERFORM itap.raise_code('processing_restriction_reason_required');
  END IF;
  IF prof.processing_restricted = p_restricted THEN
    RETURN prof;
  END IF;
  PERFORM set_config('itap.restriction_context', 'on', true);
  UPDATE itap.profiles p SET
    processing_restricted = p_restricted,
    restricted_at = CASE WHEN p_restricted THEN now() END,
    restricted_by = CASE WHEN p_restricted THEN p_actor END,
    restriction_reason = CASE WHEN p_restricted THEN reason END
  WHERE p.organization_id = p_org AND p.id = p_profile
  RETURNING * INTO prof;
  PERFORM set_config('itap.restriction_context', 'off', true);
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes, reason)
  VALUES (p_org, p_actor, CASE WHEN p_restricted THEN 'restrict' ELSE 'unrestrict' END, 'profiles', p_profile,
          jsonb_build_object('processing_restricted', p_restricted), reason);
  RETURN prof;
END;
$$;

-- org_admin (active member): restrict / lift for a profile of the session organization.
CREATE FUNCTION itap.set_processing_restriction(hasura_session json, p_profile uuid, p_restricted boolean, p_reason text)
RETURNS SETOF itap.profiles
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.require_active_member(hasura_session);
BEGIN
  RETURN NEXT itap.apply_processing_restriction(org, p_profile, p_restricted, p_reason, actor);
END;
$$;
