DROP TRIGGER access_credentials_withdrawn ON itap.watch_list_entries;
DROP TRIGGER access_credentials_withdrawn_delete ON itap.segment_members;
DROP TRIGGER access_credentials_withdrawn ON itap.segment_members;
DROP TRIGGER access_credentials_withdrawn_delete ON itap.profiles;
DROP TRIGGER access_credentials_withdrawn ON itap.profiles;
DROP FUNCTION itap.access_credentials_withdrawn();
DROP TRIGGER access_policies_guard_header ON itap.access_policies;
DROP FUNCTION itap.guard_access_policy_header();


CREATE OR REPLACE FUNCTION itap.policy_epoch_on_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  old_effect text;
  new_effect text;
BEGIN
  IF TG_TABLE_NAME = 'access_policies' THEN
    IF TG_OP = 'DELETE' THEN
      IF OLD.current_version_id IS NOT NULL THEN
        SELECT effect INTO old_effect FROM itap.access_policy_versions
        WHERE organization_id = OLD.organization_id AND id = OLD.current_version_id;
        PERFORM itap.bump_policy_epoch(OLD.organization_id, old_effect IS DISTINCT FROM 'deny');
      END IF;
      RETURN OLD;
    END IF;
    IF NEW.current_version_id IS DISTINCT FROM OLD.current_version_id THEN
      SELECT effect INTO old_effect FROM itap.access_policy_versions
      WHERE organization_id = OLD.organization_id AND id = OLD.current_version_id;
      SELECT effect INTO new_effect FROM itap.access_policy_versions
      WHERE organization_id = NEW.organization_id AND id = NEW.current_version_id;
      PERFORM itap.bump_policy_epoch(NEW.organization_id, new_effect IS NOT DISTINCT FROM 'deny' OR old_effect IS NOT DISTINCT FROM 'allow');
    END IF;
  ELSIF TG_TABLE_NAME = 'access_grants' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM itap.bump_policy_epoch(NEW.organization_id, false);
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM itap.bump_policy_epoch(OLD.organization_id, true);
      RETURN OLD;
    ELSIF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
      PERFORM itap.bump_policy_epoch(NEW.organization_id, true);
    END IF;
  ELSIF TG_TABLE_NAME = 'emergency_overrides' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM itap.bump_policy_epoch(NEW.organization_id, NEW.mode = 'lock_all');
    ELSIF TG_OP = 'UPDATE' AND NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
      PERFORM itap.bump_policy_epoch(NEW.organization_id, NEW.mode <> 'lock_all');
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION itap.revoke_access_grant(hasura_session json, p_grant uuid, p_reason text DEFAULT NULL)
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

CREATE OR REPLACE FUNCTION itap.archive_access_policy(hasura_session json, p_policy uuid)
RETURNS SETOF itap.access_policies
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.organization_member(org, itap.session_user_id(hasura_session));
  archived boolean;
BEGIN
  SELECT is_archived INTO archived FROM itap.access_policies WHERE organization_id = org AND id = p_policy FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('access_policy_not_found');
  END IF;
  IF archived THEN
    PERFORM itap.raise_code('access_policy_archived');
  END IF;
  UPDATE itap.access_policies
  SET is_archived = true, archived_at = now(), archived_by = actor, current_version_id = NULL
  WHERE organization_id = org AND id = p_policy;
  RETURN QUERY SELECT * FROM itap.access_policies WHERE organization_id = org AND id = p_policy;
END;
$$;

CREATE OR REPLACE FUNCTION itap.guard_access_policy_children() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  r record;
  org uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
BEGIN
  -- Organization cascade: nothing to guard.
  IF NOT EXISTS (SELECT 1 FROM itap.organizations o WHERE o.id = org) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  FOR r IN
    SELECT v.status FROM itap.access_policy_versions v
    WHERE (TG_OP <> 'DELETE' AND v.organization_id = NEW.organization_id AND v.id = NEW.version_id)
       OR (TG_OP <> 'INSERT' AND v.organization_id = OLD.organization_id AND v.id = OLD.version_id)
  LOOP
    IF r.status = 'pending_approval' THEN
      PERFORM itap.raise_code('access_policy_version_pending');
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION itap.guard_access_policy_version() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  in_approval boolean := coalesce(current_setting('itap.access_approval_context', true), '') = 'on';
  meta text[] := ARRAY['submitted_by', 'submitted_at', 'approved_by', 'approved_at', 'rejection_reason', 'rejected_by',
                       'rejected_at', 'status', 'published_by', 'published_at', 'updated_at'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM itap.access_policies p
               WHERE p.organization_id = NEW.organization_id AND p.id = NEW.policy_id AND p.is_archived) THEN
      PERFORM itap.raise_code('access_policy_archived');
    END IF;
    IF NEW.status = 'pending_approval' THEN
      PERFORM itap.raise_code('version_status_reserved');
    END IF;
    NEW.submitted_by := NULL; NEW.submitted_at := NULL;
    NEW.approved_by := NULL; NEW.approved_at := NULL;
    NEW.rejection_reason := NULL; NEW.rejected_by := NULL; NEW.rejected_at := NULL;
    RETURN NEW;
  END IF;
  IF NOT in_approval THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND 'pending_approval' IN (NEW.status, OLD.status) THEN
      PERFORM itap.raise_code('version_status_reserved');
    END IF;
    IF (NEW.submitted_by, NEW.submitted_at, NEW.approved_by, NEW.approved_at, NEW.rejection_reason, NEW.rejected_by,
        NEW.rejected_at)
       IS DISTINCT FROM (OLD.submitted_by, OLD.submitted_at, OLD.approved_by, OLD.approved_at, OLD.rejection_reason,
        OLD.rejected_by, OLD.rejected_at) THEN
      PERFORM itap.raise_code('access_policy_approval_reserved');
    END IF;
  END IF;
  IF OLD.status = 'pending_approval' AND NEW.status = 'pending_approval'
     AND (to_jsonb(NEW) - meta) IS DISTINCT FROM (to_jsonb(OLD) - meta) THEN
    PERFORM itap.raise_code('access_policy_version_pending');
  END IF;
  RETURN NEW;
END;
$$;
