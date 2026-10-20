-- Restores the guards of slices 8-10 task 1 (definitions before 1792365700235) and drops the retention context.
DROP TRIGGER events_append_only ON itap.events;
DROP TRIGGER access_decisions_append_only ON itap.access_decisions;
DROP TRIGGER audit_log_append_only ON itap.audit_log;
DROP FUNCTION itap.guard_append_only();
DROP TRIGGER authentication_attempts_guard ON itap.authentication_attempts;
CREATE TRIGGER authentication_attempts_guard BEFORE INSERT OR UPDATE ON itap.authentication_attempts
  FOR EACH ROW EXECUTE FUNCTION itap.guard_authentication_attempt();
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
$function$

;
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
$function$

;
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
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM itap.organizations o WHERE o.id = org) THEN
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
$function$

;
CREATE OR REPLACE FUNCTION itap.segment_members_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  merging constant boolean := coalesce(current_setting('itap.merge_context', true), '') = 'on';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() < 2 AND NOT merging THEN
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
$function$

;
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
      PERFORM itap.bump_policy_epoch(OLD.organization_id, true);
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
$function$

;
DROP FUNCTION itap.retention_end(text);
DROP FUNCTION itap.retention_begin();
DROP FUNCTION itap.retention_context();
