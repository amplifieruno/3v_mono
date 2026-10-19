-- Slice 8 task 1, fix round 1 (review): close the SQL / admin-secret bypasses of the approval workflow, make
-- archive supersede the enforced version, and bump the policy epoch urgently on credential withdrawal.
--   * enforced = access_policies.current_version_id set and not archived; 'published' == enforced: the header
--     pointer changes only inside publish_version (itap.version_context, to a published version of the same policy)
--     or inside archive_access_policy (itap.access_archive_context, to NULL); is_archived only false -> true and
--     archived_* only under the archive flag (guard_access_policy_header);
--   * a version becomes published only under itap.access_approval_context (approve), superseded only under it or
--     the archive flag: no direct publish_version republish, even from SQL;
--   * archive supersedes the enforced version and rejects a pending version back to draft ('policy_archived');
--   * the archived check on version insert takes the header row lock (closes the insert-vs-archive race);
--   * the pending-children guard reads the version FOR SHARE;
--   * revoke_access_grant needs an active, unexpired member;
--   * urgency: an allow version with max_risk is urgent on publish (risk can now deny); every override start is
--     urgent (lock_all reduces access; unlock_all / evacuation are life-safety and must reach doors promptly);
--   * credential withdrawal (profile leaves active, access level lowered, profile type changed, profile deleted,
--     segment membership closed / deleted, blacklist entry added) bumps the epoch urgently at commit, once per
--     transaction and organization (deferred constraint triggers: the organization_settings row lock is taken
--     last and held only while committing).

CREATE FUNCTION itap.guard_access_policy_header() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  in_version boolean := coalesce(current_setting('itap.version_context', true), '') = 'on';
  in_archive boolean := coalesce(current_setting('itap.access_archive_context', true), '') = 'on';
BEGIN
  IF NEW.current_version_id IS DISTINCT FROM OLD.current_version_id THEN
    IF NEW.current_version_id IS NULL THEN
      IF NOT in_archive THEN
        PERFORM itap.raise_code('access_policy_header_reserved');
      END IF;
    ELSIF NOT in_version OR NOT EXISTS (
      SELECT 1 FROM itap.access_policy_versions v
      WHERE v.organization_id = NEW.organization_id AND v.id = NEW.current_version_id AND v.policy_id = NEW.id
        AND v.status = 'published'
    ) THEN
      PERFORM itap.raise_code('access_policy_header_reserved');
    END IF;
  END IF;
  IF NEW.is_archived IS DISTINCT FROM OLD.is_archived AND NOT (in_archive AND NEW.is_archived AND NOT OLD.is_archived) THEN
    PERFORM itap.raise_code('access_policy_header_reserved');
  END IF;
  IF (NEW.archived_at, NEW.archived_by) IS DISTINCT FROM (OLD.archived_at, OLD.archived_by) AND NOT in_archive THEN
    PERFORM itap.raise_code('access_policy_header_reserved');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER access_policies_guard_header BEFORE UPDATE ON itap.access_policies
  FOR EACH ROW EXECUTE FUNCTION itap.guard_access_policy_header();

CREATE OR REPLACE FUNCTION itap.guard_access_policy_version() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  in_approval boolean := coalesce(current_setting('itap.access_approval_context', true), '') = 'on';
  in_archive boolean := coalesce(current_setting('itap.access_archive_context', true), '') = 'on';
  archived boolean;
  meta text[] := ARRAY['submitted_by', 'submitted_at', 'approved_by', 'approved_at', 'rejection_reason', 'rejected_by',
                       'rejected_at', 'status', 'published_by', 'published_at', 'updated_at'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Header lock (the same one assign_version_number takes): serialises with archive_access_policy.
    SELECT p.is_archived INTO archived FROM itap.access_policies p
    WHERE p.organization_id = NEW.organization_id AND p.id = NEW.policy_id FOR UPDATE;
    IF archived THEN
      PERFORM itap.raise_code('access_policy_archived');
    END IF;
    IF NEW.status <> 'draft' THEN
      PERFORM itap.raise_code('version_status_reserved');
    END IF;
    NEW.submitted_by := NULL; NEW.submitted_at := NULL;
    NEW.approved_by := NULL; NEW.approved_at := NULL;
    NEW.rejection_reason := NULL; NEW.rejected_by := NULL; NEW.rejected_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'published' AND NOT in_approval THEN
      PERFORM itap.raise_code('version_status_reserved');
    END IF;
    IF NEW.status = 'superseded' AND NOT (in_approval OR in_archive) THEN
      PERFORM itap.raise_code('version_status_reserved');
    END IF;
    IF 'pending_approval' IN (NEW.status, OLD.status) AND NOT in_approval THEN
      PERFORM itap.raise_code('version_status_reserved');
    END IF;
  END IF;
  IF NOT in_approval
     AND (NEW.submitted_by, NEW.submitted_at, NEW.approved_by, NEW.approved_at, NEW.rejection_reason, NEW.rejected_by,
          NEW.rejected_at)
       IS DISTINCT FROM (OLD.submitted_by, OLD.submitted_at, OLD.approved_by, OLD.approved_at, OLD.rejection_reason,
          OLD.rejected_by, OLD.rejected_at) THEN
    PERFORM itap.raise_code('access_policy_approval_reserved');
  END IF;
  IF OLD.status = 'pending_approval' AND NEW.status = 'pending_approval'
     AND (to_jsonb(NEW) - meta) IS DISTINCT FROM (to_jsonb(OLD) - meta) THEN
    PERFORM itap.raise_code('access_policy_version_pending');
  END IF;
  RETURN NEW;
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
  -- FOR SHARE: a concurrent submit (FOR UPDATE on the version) waits for this change, or this change sees pending.
  FOR r IN
    SELECT v.status FROM itap.access_policy_versions v
    WHERE (TG_OP <> 'DELETE' AND v.organization_id = NEW.organization_id AND v.id = NEW.version_id)
       OR (TG_OP <> 'INSERT' AND v.organization_id = OLD.organization_id AND v.id = OLD.version_id)
    FOR SHARE
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

-- Archive: rejects a pending version ('policy_archived', audit reject), supersedes the enforced version, clears the
-- pointer. Terminal (no unarchive).
CREATE OR REPLACE FUNCTION itap.archive_access_policy(hasura_session json, p_policy uuid)
RETURNS SETOF itap.access_policies
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.organization_member(org, itap.session_user_id(hasura_session));
  archived boolean;
  pending uuid;
BEGIN
  SELECT is_archived INTO archived FROM itap.access_policies WHERE organization_id = org AND id = p_policy FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('access_policy_not_found');
  END IF;
  IF archived THEN
    PERFORM itap.raise_code('access_policy_archived');
  END IF;
  PERFORM set_config('itap.access_approval_context', 'on', true);
  PERFORM set_config('itap.version_context', 'on', true);
  PERFORM set_config('itap.access_archive_context', 'on', true);
  FOR pending IN
    UPDATE itap.access_policy_versions
    SET status = 'draft', rejection_reason = 'policy_archived', rejected_by = actor, rejected_at = now(),
        submitted_by = NULL, submitted_at = NULL
    WHERE organization_id = org AND policy_id = p_policy AND status = 'pending_approval'
    RETURNING id
  LOOP
    INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes, reason)
    VALUES (org, actor, 'reject', 'access_policy_versions', pending, jsonb_build_object('policy_id', p_policy), 'policy_archived');
  END LOOP;
  UPDATE itap.access_policy_versions SET status = 'superseded'
  WHERE organization_id = org AND policy_id = p_policy AND status = 'published';
  UPDATE itap.access_policies
  SET is_archived = true, archived_at = now(), archived_by = actor, current_version_id = NULL
  WHERE organization_id = org AND id = p_policy;
  PERFORM set_config('itap.access_archive_context', 'off', true);
  PERFORM set_config('itap.version_context', 'off', true);
  PERFORM set_config('itap.access_approval_context', 'off', true);
  RETURN QUERY SELECT * FROM itap.access_policies WHERE organization_id = org AND id = p_policy;
END;
$$;

CREATE OR REPLACE FUNCTION itap.revoke_access_grant(hasura_session json, p_grant uuid, p_reason text DEFAULT NULL)
RETURNS SETOF itap.access_grants
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid;
  revoked timestamptz;
BEGIN
  SELECT m.user_id INTO actor FROM itap.organization_members m
  WHERE m.organization_id = org AND m.user_id = itap.session_user_id(hasura_session)
    AND m.status = 'active' AND (m.expires_at IS NULL OR m.expires_at > now());
  IF actor IS NULL THEN
    PERFORM itap.raise_code('member_required');
  END IF;
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

CREATE OR REPLACE FUNCTION itap.policy_epoch_on_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  old_effect text;
  new_effect text;
  new_max_risk numeric;
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
      SELECT effect, max_risk INTO new_effect, new_max_risk FROM itap.access_policy_versions
      WHERE organization_id = NEW.organization_id AND id = NEW.current_version_id;
      PERFORM itap.bump_policy_epoch(
        NEW.organization_id,
        new_effect IS NOT DISTINCT FROM 'deny' OR old_effect IS NOT DISTINCT FROM 'allow'
          OR (new_effect IS NOT DISTINCT FROM 'allow' AND new_max_risk IS NOT NULL)
      );
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
      PERFORM itap.bump_policy_epoch(NEW.organization_id, true);
    ELSIF TG_OP = 'UPDATE' AND NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
      PERFORM itap.bump_policy_epoch(NEW.organization_id, NEW.mode <> 'lock_all');
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- Credential withdrawal: urgent bump at commit, once per transaction and organization.
CREATE FUNCTION itap.access_credentials_withdrawn() RETURNS trigger
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

CREATE CONSTRAINT TRIGGER access_credentials_withdrawn AFTER UPDATE ON itap.profiles
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN ((OLD.status IS DISTINCT FROM NEW.status AND NEW.status <> 'active')
        OR coalesce(itap.access_rank(NEW.access_level), 0) < coalesce(itap.access_rank(OLD.access_level), 0)
        OR OLD.profile_type IS DISTINCT FROM NEW.profile_type)
  EXECUTE FUNCTION itap.access_credentials_withdrawn();
CREATE CONSTRAINT TRIGGER access_credentials_withdrawn_delete AFTER DELETE ON itap.profiles
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION itap.access_credentials_withdrawn();
CREATE CONSTRAINT TRIGGER access_credentials_withdrawn AFTER UPDATE ON itap.segment_members
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL)
  EXECUTE FUNCTION itap.access_credentials_withdrawn();
CREATE CONSTRAINT TRIGGER access_credentials_withdrawn_delete AFTER DELETE ON itap.segment_members
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION itap.access_credentials_withdrawn();
CREATE CONSTRAINT TRIGGER access_credentials_withdrawn AFTER INSERT ON itap.watch_list_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION itap.access_credentials_withdrawn();
