-- Access policy lifecycle (tracked mutations, org_admin, session organization only; spec §6.0, §6.13, SA_5 §2.1.4):
--   create_access_policy_draft(policy[, from_version]) -> the open version (draft or pending), else a new draft copied
--       from the current version (or from_version: rollback = copy of a superseded version; refused while a version
--       is open, version_open_exists);
--   submit_access_policy_version(version)       draft -> pending_approval (needs >= 1 subject and >= 1 target);
--   approve_access_policy_version(version)      pending_approval -> published by a member other than the submitter
--       (four_eyes_required); audit rows approve + publish;
--   reject_access_policy_version(version, reason) pending_approval -> draft with the reason; audit row reject;
--   archive_access_policy(policy)               is_archived, clears current_version_id (row audit on the header).
-- Lock order: policy header -> version (as itap.publish_version / itap.create_draft_version), then the
-- organization settings row (policy epoch, *_policy_distribution).

-- Generic: a new draft copied from a given version of the header (children included). Raises version_not_found
-- (source not of this header) and version_open_exists (an open draft / pending version exists).
CREATE FUNCTION itap.create_draft_version_from(
  p_versions regclass,
  p_headers regclass,
  p_parent_column text,
  p_children regclass[],
  p_organization_id uuid,
  p_parent uuid,
  p_source uuid
) RETURNS uuid
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  locked integer;
  found uuid;
  draft uuid;
  cols text;
  child regclass;
BEGIN
  EXECUTE format('SELECT 1 FROM %s WHERE organization_id = $1 AND id = $2 FOR UPDATE', p_headers)
    USING p_organization_id, p_parent;
  GET DIAGNOSTICS locked = ROW_COUNT;
  IF locked = 0 THEN
    PERFORM itap.raise_code('version_parent_not_found');
  END IF;
  EXECUTE format('SELECT id FROM %s WHERE organization_id = $1 AND %I = $2 AND id = $3', p_versions, p_parent_column)
    INTO found USING p_organization_id, p_parent, p_source;
  IF found IS NULL THEN
    PERFORM itap.raise_code('version_not_found');
  END IF;
  EXECUTE format(
    'SELECT id FROM %s WHERE organization_id = $1 AND %I = $2 AND status IN (''draft'', ''pending_approval'')',
    p_versions, p_parent_column
  ) INTO found USING p_organization_id, p_parent;
  IF found IS NOT NULL THEN
    PERFORM itap.raise_code('version_open_exists');
  END IF;
  cols := itap.copyable_columns(
    p_versions, ARRAY['id', 'status', 'version', 'published_by', 'published_at', 'created_at', 'updated_at']
  );
  EXECUTE format('INSERT INTO %s (%s) SELECT %s FROM %s WHERE organization_id = $1 AND id = $2 RETURNING id',
    p_versions, cols, cols, p_versions)
    INTO draft USING p_organization_id, p_source;
  FOREACH child IN ARRAY coalesce(p_children, '{}') LOOP
    cols := itap.copyable_columns(child, ARRAY['id', 'version_id', 'created_at', 'updated_at']);
    EXECUTE format('INSERT INTO %s (version_id, %s) SELECT $3, %s FROM %s WHERE organization_id = $1 AND version_id = $2',
      child, cols, cols, child)
      USING p_organization_id, p_source, draft;
  END LOOP;
  RETURN draft;
END;
$$;

-- Locks the policy header then the version (both of the organization); raises the not-found codes and
-- access_policy_archived. Returns the policy id.
CREATE FUNCTION itap.lock_access_policy_version(p_org uuid, p_version uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  policy uuid;
  archived boolean;
BEGIN
  SELECT policy_id INTO policy FROM itap.access_policy_versions WHERE organization_id = p_org AND id = p_version;
  IF policy IS NULL THEN
    PERFORM itap.raise_code('access_policy_version_not_found');
  END IF;
  SELECT is_archived INTO archived FROM itap.access_policies WHERE organization_id = p_org AND id = policy FOR UPDATE;
  PERFORM 1 FROM itap.access_policy_versions WHERE organization_id = p_org AND id = p_version FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('access_policy_version_not_found');
  END IF;
  IF archived THEN
    PERFORM itap.raise_code('access_policy_archived');
  END IF;
  RETURN policy;
END;
$$;

CREATE FUNCTION itap.create_access_policy_draft(hasura_session json, p_policy uuid, p_from_version uuid DEFAULT NULL)
RETURNS SETOF itap.access_policy_versions
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
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
$$;

CREATE FUNCTION itap.submit_access_policy_version(hasura_session json, p_version uuid)
RETURNS SETOF itap.access_policy_versions
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.organization_member(org, itap.session_user_id(hasura_session));
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
$$;

CREATE FUNCTION itap.approve_access_policy_version(hasura_session json, p_version uuid)
RETURNS SETOF itap.access_policy_versions
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.organization_member(org, itap.session_user_id(hasura_session));
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
$$;

CREATE FUNCTION itap.reject_access_policy_version(hasura_session json, p_version uuid, p_reason text)
RETURNS SETOF itap.access_policy_versions
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.organization_member(org, itap.session_user_id(hasura_session));
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
$$;

CREATE FUNCTION itap.archive_access_policy(hasura_session json, p_policy uuid)
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
