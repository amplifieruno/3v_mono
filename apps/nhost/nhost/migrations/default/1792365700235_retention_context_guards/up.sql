-- Slice 10 task 2: one transaction-local bypass for the retention engine, itap.retention_context (set only by the
-- itap.purge_* functions through itap.retention_begin / retention_end). Every append-only / delete guard a purge
-- touches recognises it; outside it the guards keep refusing direct deletes and edits (also from SQL / admin secret).
-- New append-only guards (itap.guard_append_only) on events, access_decisions and audit_log: no delete (except the
-- organization cascade) and no update except FK SET NULL actions on the listed reference columns. Existing guards are
-- extended minimally from their latest definitions: authentication attempts (delete refused), used grants, emergency
-- overrides (+ areas), segment membership history; a retention delete of a grant does not bump the policy epoch
-- (only used / revoked / expired grants are purged: no access narrows).

CREATE FUNCTION itap.retention_context() RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(current_setting('itap.retention_context', true), '') = 'on';
$$;

-- Turns the context on and returns the previous value (restore it with itap.retention_end).
CREATE FUNCTION itap.retention_begin() RETURNS text
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  previous text := coalesce(current_setting('itap.retention_context', true), '');
BEGIN
  PERFORM set_config('itap.retention_context', 'on', true);
  RETURN previous;
END;
$$;

CREATE FUNCTION itap.retention_end(p_previous text) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM set_config('itap.retention_context', coalesce(nullif(p_previous, ''), 'off'), true);
END;
$$;

-- Append-only log guard. TG_ARGV: reference columns an FK action (ON DELETE SET NULL) may null.
CREATE FUNCTION itap.guard_append_only() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  changed text;
BEGIN
  IF itap.retention_context() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    -- Organization cascade (or rows of a deleted organization, audit_log has no FK): nothing left to protect.
    IF NOT EXISTS (SELECT 1 FROM itap.organizations o WHERE o.id = OLD.organization_id) THEN
      RETURN OLD;
    END IF;
    PERFORM itap.raise_code(TG_TABLE_NAME || '_append_only');
  END IF;
  FOR changed IN
    SELECT n.key FROM jsonb_each(to_jsonb(NEW)) n WHERE n.value IS DISTINCT FROM to_jsonb(OLD) -> n.key
  LOOP
    IF changed = ANY (TG_ARGV) AND to_jsonb(NEW) -> changed = 'null'::jsonb THEN
      CONTINUE;
    END IF;
    PERFORM itap.raise_code(TG_TABLE_NAME || '_append_only');
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER events_append_only BEFORE UPDATE OR DELETE ON itap.events
  FOR EACH ROW EXECUTE FUNCTION itap.guard_append_only(
    'facility_id', 'area_id', 'access_point_id', 'device_id', 'identity_id', 'profile_id', 'rule_version_id');
CREATE TRIGGER access_decisions_append_only BEFORE UPDATE OR DELETE ON itap.access_decisions
  FOR EACH ROW EXECUTE FUNCTION itap.guard_append_only(
    'facility_id', 'access_point_id', 'device_id', 'identity_id', 'profile_id');
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON itap.audit_log
  FOR EACH ROW EXECUTE FUNCTION itap.guard_append_only();

-- Authentication attempts: + delete refused (organization cascade exempt); anything under the retention context.
CREATE OR REPLACE FUNCTION itap.guard_authentication_attempt()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  nullable_refs text[] := ARRAY['session_id', 'claimed_identity_id', 'matched_identity_id', 'profile_id',
    'access_point_id', 'evidence_file_id'];
  review_cols text[] := ARRAY['review_status', 'reviewed_by', 'reviewed_at', 'review_note'];
  in_review boolean := coalesce(current_setting('itap.auth_review_context', true), '') = 'on';
  changed text;
  file_kind text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.evidence_file_id IS NOT NULL THEN
      SELECT f.metadata ->> 'kind' INTO file_kind FROM storage.files f WHERE f.id = NEW.evidence_file_id;
      IF file_kind IS DISTINCT FROM 'auth_capture' THEN
        PERFORM itap.raise_code('auth_evidence_kind');
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF itap.retention_context() OR NOT EXISTS (SELECT 1 FROM itap.organizations o WHERE o.id = OLD.organization_id) THEN
      RETURN OLD;
    END IF;
    PERFORM itap.raise_code('authentication_attempt_immutable');
  END IF;
  IF itap.retention_context() THEN
    RETURN NEW;
  END IF;
  FOR changed IN
    SELECT n.key FROM jsonb_each(to_jsonb(NEW)) n
    WHERE n.value IS DISTINCT FROM to_jsonb(OLD) -> n.key
  LOOP
    IF changed = ANY (nullable_refs) AND to_jsonb(NEW) -> changed = 'null'::jsonb THEN
      CONTINUE;
    END IF;
    IF in_review AND changed = ANY (review_cols) THEN
      CONTINUE;
    END IF;
    PERFORM itap.raise_code('authentication_attempt_immutable');
  END LOOP;
  RETURN NEW;
END;
$function$;
DROP TRIGGER authentication_attempts_guard ON itap.authentication_attempts;
CREATE TRIGGER authentication_attempts_guard BEFORE INSERT OR UPDATE OR DELETE ON itap.authentication_attempts
  FOR EACH ROW EXECUTE FUNCTION itap.guard_authentication_attempt();

-- Grants: a used grant may be deleted by retention.
CREATE OR REPLACE FUNCTION itap.guard_access_grant()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  in_revoke boolean := coalesce(current_setting('itap.access_grant_context', true), '') = 'on';
  fixed text[] := ARRAY['used_at', 'revoked_at', 'revoked_by', 'revoke_reason', 'updated_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.used_at IS NOT NULL AND NOT itap.retention_context()
       AND EXISTS (SELECT 1 FROM itap.organizations o WHERE o.id = OLD.organization_id) THEN
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
$function$;

-- Overrides and their areas: retention may delete ended overrides.
CREATE OR REPLACE FUNCTION itap.guard_emergency_override()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  in_context boolean := coalesce(current_setting('itap.override_context', true), '') = 'on';
  org uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
  ending text[] := ARRAY['ended_at', 'ended_by', 'end_reason', 'updated_at'];
BEGIN
  IF TG_OP = 'DELETE' AND (itap.retention_context() OR NOT EXISTS (SELECT 1 FROM itap.organizations o WHERE o.id = org)) THEN
    RETURN OLD;
  END IF;
  IF NOT in_context OR TG_OP = 'DELETE' THEN
    PERFORM itap.raise_code('emergency_override_function_only');
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME <> 'emergency_overrides' THEN
      PERFORM itap.raise_code('emergency_override_not_editable');
    END IF;
    IF (to_jsonb(NEW) - ending) IS DISTINCT FROM (to_jsonb(OLD) - ending) OR to_jsonb(OLD) ->> 'ended_at' IS NOT NULL THEN
      PERFORM itap.raise_code('emergency_override_not_editable');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Membership history rows may be deleted by retention / erasure (besides FK cascades and merges).
CREATE OR REPLACE FUNCTION itap.segment_members_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  merging constant boolean := coalesce(current_setting('itap.merge_context', true), '') = 'on';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() < 2 AND NOT merging AND NOT itap.retention_context() THEN
      PERFORM itap.raise_code('segment_member_delete_forbidden');
    END IF;
    RETURN OLD;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['removed_at', 'removed_by', 'updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['removed_at', 'removed_by', 'updated_at'])
     OR (OLD.removed_at IS NOT NULL AND NOT (merging AND NEW.removed_at IS NULL AND NEW.removed_by IS NULL)
         AND (NEW.removed_at IS DISTINCT FROM OLD.removed_at OR NEW.removed_by IS DISTINCT FROM OLD.removed_by)) THEN
    PERFORM itap.raise_code('segment_member_immutable');
  END IF;
  RETURN NEW;
END;
$function$;

-- A retention delete of a grant (used / revoked / expired) narrows nothing: no epoch bump (no storm).
CREATE OR REPLACE FUNCTION itap.policy_epoch_on_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
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
      IF NOT itap.retention_context() THEN
        PERFORM itap.bump_policy_epoch(OLD.organization_id, true);
      END IF;
      RETURN OLD;
    ELSIF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
      PERFORM itap.bump_policy_epoch(NEW.organization_id, true);
    END IF;
  ELSIF TG_TABLE_NAME = 'emergency_overrides' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM itap.bump_policy_epoch(NEW.organization_id, true);
    ELSIF TG_OP = 'UPDATE' AND NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
      PERFORM itap.bump_policy_epoch(NEW.organization_id, true);
    END IF;
  ELSIF TG_TABLE_NAME = 'access_points' THEN
    PERFORM itap.bump_policy_epoch(NEW.organization_id, false);
  END IF;
  RETURN NULL;
END;
$function$;
