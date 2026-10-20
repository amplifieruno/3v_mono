-- Slice 8 final review: the policy lifecycle functions (create draft, submit, approve, reject, archive) require an
-- active, unexpired member (itap.require_active_member raises member_required), like overrides and grant revocation.
CREATE OR REPLACE FUNCTION itap.create_access_policy_draft(hasura_session json, p_policy uuid, p_from_version uuid DEFAULT NULL::uuid)
 RETURNS SETOF itap.access_policy_versions
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.require_active_member(hasura_session);
  archived boolean;
  draft uuid;
BEGIN
  SELECT is_archived INTO archived FROM itap.access_policies WHERE organization_id = org AND id = p_policy;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('access_policy_not_found');
  END IF;
  IF archived THEN
    PERFORM itap.raise_code('access_policy_archived');
  END IF;
  IF p_from_version IS NULL THEN
    draft := itap.create_draft_version(
      'itap.access_policy_versions', 'itap.access_policies', 'policy_id',
      ARRAY['itap.access_policy_version_subjects'::regclass, 'itap.access_policy_version_targets'::regclass], org, p_policy
    );
  ELSE
    draft := itap.create_draft_version_from(
      'itap.access_policy_versions', 'itap.access_policies', 'policy_id',
      ARRAY['itap.access_policy_version_subjects'::regclass, 'itap.access_policy_version_targets'::regclass], org, p_policy,
      p_from_version
    );
  END IF;
  RETURN QUERY SELECT * FROM itap.access_policy_versions WHERE organization_id = org AND id = draft;
END;
$function$;

CREATE OR REPLACE FUNCTION itap.submit_access_policy_version(hasura_session json, p_version uuid)
 RETURNS SETOF itap.access_policy_versions
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.require_active_member(hasura_session);
  version_status text;
BEGIN
  PERFORM itap.lock_access_policy_version(org, p_version);
  SELECT status INTO version_status FROM itap.access_policy_versions WHERE organization_id = org AND id = p_version;
  IF version_status <> 'draft' THEN
    PERFORM itap.raise_code('access_policy_version_not_draft');
  END IF;
  IF actor IS NULL THEN
    PERFORM itap.raise_code('member_required');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM itap.access_policy_version_subjects WHERE organization_id = org AND version_id = p_version)
     OR NOT EXISTS (SELECT 1 FROM itap.access_policy_version_targets WHERE organization_id = org AND version_id = p_version) THEN
    PERFORM itap.raise_code('access_policy_version_incomplete');
  END IF;
  PERFORM set_config('itap.access_approval_context', 'on', true);
  UPDATE itap.access_policy_versions
  SET status = 'pending_approval', submitted_by = actor, submitted_at = now(),
      rejection_reason = NULL, rejected_by = NULL, rejected_at = NULL
  WHERE organization_id = org AND id = p_version;
  PERFORM set_config('itap.access_approval_context', 'off', true);
  RETURN QUERY SELECT * FROM itap.access_policy_versions WHERE organization_id = org AND id = p_version;
END;
$function$;

CREATE OR REPLACE FUNCTION itap.approve_access_policy_version(hasura_session json, p_version uuid)
 RETURNS SETOF itap.access_policy_versions
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.require_active_member(hasura_session);
  policy uuid;
  v record;
BEGIN
  policy := itap.lock_access_policy_version(org, p_version);
  SELECT status, submitted_by INTO v FROM itap.access_policy_versions WHERE organization_id = org AND id = p_version;
  IF v.status <> 'pending_approval' THEN
    PERFORM itap.raise_code('access_policy_version_not_pending');
  END IF;
  IF actor IS NULL OR actor IS NOT DISTINCT FROM v.submitted_by THEN
    PERFORM itap.raise_code('four_eyes_required');
  END IF;
  PERFORM set_config('itap.access_approval_context', 'on', true);
  UPDATE itap.access_policy_versions SET approved_by = actor, approved_at = now()
  WHERE organization_id = org AND id = p_version;
  PERFORM itap.publish_version(
    'itap.access_policy_versions', 'itap.access_policies', 'policy_id', org, p_version, actor
  );
  PERFORM set_config('itap.access_approval_context', 'off', true);
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes) VALUES
    (org, actor, 'approve', 'access_policy_versions', p_version,
     jsonb_build_object('policy_id', policy, 'submitted_by', v.submitted_by)),
    (org, actor, 'publish', 'access_policy_versions', p_version, jsonb_build_object('policy_id', policy));
  RETURN QUERY SELECT * FROM itap.access_policy_versions WHERE organization_id = org AND id = p_version;
END;
$function$;

CREATE OR REPLACE FUNCTION itap.reject_access_policy_version(hasura_session json, p_version uuid, p_reason text)
 RETURNS SETOF itap.access_policy_versions
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.require_active_member(hasura_session);
  policy uuid;
BEGIN
  policy := itap.lock_access_policy_version(org, p_version);
  IF (SELECT status FROM itap.access_policy_versions WHERE organization_id = org AND id = p_version) <> 'pending_approval' THEN
    PERFORM itap.raise_code('access_policy_version_not_pending');
  END IF;
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    PERFORM itap.raise_code('rejection_reason_required');
  END IF;
  PERFORM set_config('itap.access_approval_context', 'on', true);
  UPDATE itap.access_policy_versions
  SET status = 'draft', rejection_reason = btrim(p_reason), rejected_by = actor, rejected_at = now(),
      submitted_by = NULL, submitted_at = NULL
  WHERE organization_id = org AND id = p_version;
  PERFORM set_config('itap.access_approval_context', 'off', true);
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes, reason)
  VALUES (org, actor, 'reject', 'access_policy_versions', p_version, jsonb_build_object('policy_id', policy), btrim(p_reason));
  RETURN QUERY SELECT * FROM itap.access_policy_versions WHERE organization_id = org AND id = p_version;
END;
$function$;

CREATE OR REPLACE FUNCTION itap.archive_access_policy(hasura_session json, p_policy uuid)
 RETURNS SETOF itap.access_policies
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.require_active_member(hasura_session);
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
$function$;

