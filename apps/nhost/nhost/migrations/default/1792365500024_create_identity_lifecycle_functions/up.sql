-- Identity lifecycle mutations (spec §6.3, §8.0, §8.1): merge, rollback, split, verification decisions.
-- Tracked as Hasura mutations with the `hasura_session` session argument. Every id is resolved inside the session
-- organization only (an id of another organization behaves like a missing one: error, nothing changes). Errors are
-- RAISEd with a stable code as the message. Merge/rollback/split set the transaction-local `itap.merge_context` flag
-- (status `merged`, sources `merge`/`split`, migration *_reserve_merged_identity_status) and reset it before
-- returning, so later mutations of the same GraphQL request cannot use it.

-- Session organization; raises when the session carries none (e.g. the bare admin secret).
CREATE FUNCTION itap.session_organization(hasura_session json) RETURNS uuid
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org text := hasura_session ->> 'x-hasura-organization-id';
BEGIN
  IF org IS NULL OR org !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'insufficient_privilege', MESSAGE = 'organization_required';
  END IF;
  RETURN org::uuid;
END;
$$;

-- Session user id when it is a uuid (audit rows record it as is), else null.
CREATE FUNCTION itap.session_user_id(hasura_session json) RETURNS uuid
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE WHEN u ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN u::uuid END
  FROM (SELECT hasura_session ->> 'x-hasura-user-id' AS u) s;
$$;

-- The user when they are a member of the organization (member FK columns), else null.
CREATE FUNCTION itap.organization_member(p_organization_id uuid, p_user_id uuid) RETURNS uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT m.user_id FROM itap.organization_members m WHERE m.organization_id = p_organization_id AND m.user_id = p_user_id;
$$;

CREATE FUNCTION itap.raise_code(p_code text) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = p_code;
END;
$$;

CREATE FUNCTION itap.merge_identities(hasura_session json, p_target uuid, p_sources uuid[], p_reason text DEFAULT NULL)
RETURNS SETOF itap.identity_merges
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.session_user_id(hasura_session);
  sources uuid[];
  all_ids uuid[];
  locked_count int;
  linked uuid[];
  target_profile uuid;
  inherit_primary boolean;
  merge_row itap.identity_merges;
  photos_moved int;
  embeddings_moved int;
  lock_id uuid;
BEGIN
  SELECT coalesce(array_agg(DISTINCT s), '{}') INTO sources FROM unnest(p_sources) s WHERE s IS NOT NULL;
  IF cardinality(sources) = 0 THEN PERFORM itap.raise_code('merge_sources_required'); END IF;
  IF p_target = ANY (sources) THEN PERFORM itap.raise_code('merge_source_is_target'); END IF;
  all_ids := sources || p_target;

  SELECT count(*) INTO locked_count FROM (
    SELECT id FROM itap.identities WHERE organization_id = org AND id = ANY (all_ids) ORDER BY id FOR UPDATE
  ) l;
  IF p_target IS NULL OR locked_count <> cardinality(all_ids) THEN PERFORM itap.raise_code('identity_not_found'); END IF;
  IF EXISTS (SELECT 1 FROM itap.identities WHERE organization_id = org AND id = ANY (all_ids) AND status = 'merged') THEN
    PERFORM itap.raise_code('identity_already_merged');
  END IF;
  SELECT coalesce(array_agg(DISTINCT profile_id) FILTER (WHERE profile_id IS NOT NULL), '{}'),
         bool_or(is_primary_for_profile) FILTER (WHERE id <> p_target)
    INTO linked, inherit_primary
  FROM itap.identities WHERE organization_id = org AND id = ANY (all_ids);
  -- Never re-link silently: all linked identities must share one profile (Review Focus 1).
  IF cardinality(linked) > 1 THEN PERFORM itap.raise_code('merge_profile_conflict'); END IF;
  SELECT profile_id INTO target_profile FROM itap.identities WHERE organization_id = org AND id = p_target;
  inherit_primary := coalesce(inherit_primary, false)
    AND NOT (SELECT is_primary_for_profile FROM itap.identities WHERE organization_id = org AND id = p_target);
  FOR lock_id IN SELECT unnest(all_ids) ORDER BY 1 LOOP
    PERFORM itap.lock_identity_templates(lock_id);
  END LOOP;

  PERFORM set_config('itap.merge_context', 'on', true);
  INSERT INTO itap.identity_merges
    (organization_id, target_identity_id, reason, inherited_profile_id, inherited_primary, merged_by)
  VALUES (
    org, p_target, p_reason, CASE WHEN target_profile IS NULL THEN linked[1] END, inherit_primary,
    itap.organization_member(org, actor)
  )
  RETURNING * INTO merge_row;
  INSERT INTO itap.identity_merge_sources
    (organization_id, merge_id, source_identity_id, previous_status, previous_profile_id, previous_is_primary)
  SELECT org, merge_row.id, i.id, i.status, i.profile_id, i.is_primary_for_profile
  FROM itap.identities i WHERE i.organization_id = org AND i.id = ANY (sources);

  INSERT INTO itap.identity_merge_moves (organization_id, merge_id, entity, row_id, from_identity_id)
  SELECT org, merge_row.id, 'identity_photos', p.id, p.identity_id
  FROM itap.identity_photos p WHERE p.organization_id = org AND p.identity_id = ANY (sources);
  GET DIAGNOSTICS photos_moved = ROW_COUNT;
  INSERT INTO itap.identity_merge_moves (organization_id, merge_id, entity, row_id, from_identity_id)
  SELECT org, merge_row.id, 'identity_embeddings', e.id, e.identity_id
  FROM itap.identity_embeddings e WHERE e.organization_id = org AND e.identity_id = ANY (sources);
  GET DIAGNOSTICS embeddings_moved = ROW_COUNT;
  UPDATE itap.identity_photos SET identity_id = p_target WHERE organization_id = org AND identity_id = ANY (sources);
  UPDATE itap.identity_embeddings SET identity_id = p_target WHERE organization_id = org AND identity_id = ANY (sources);

  -- Merged sources leave their profile (identities_count / has_face count live identities only); the target takes
  -- over the profile when it had none, and the primary flag when a source held it.
  UPDATE itap.identities SET status = 'merged', profile_id = NULL WHERE organization_id = org AND id = ANY (sources);
  IF cardinality(linked) = 1 AND (target_profile IS NULL OR inherit_primary) THEN
    UPDATE itap.identities
    SET profile_id = linked[1], is_primary_for_profile = is_primary_for_profile OR inherit_primary
    WHERE organization_id = org AND id = p_target;
  END IF;

  UPDATE itap.identity_duplicate_candidates SET status = 'merged'
  WHERE organization_id = org AND status = 'open' AND identity_a_id = ANY (all_ids) AND identity_b_id = ANY (all_ids);

  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes, reason)
  VALUES (org, actor, 'merge', 'identity_merges', merge_row.id, jsonb_build_object(
    'target_identity_id', p_target, 'source_identity_ids', to_jsonb(sources), 'photos_moved', photos_moved,
    'embeddings_moved', embeddings_moved, 'inherited_profile_id', merge_row.inherited_profile_id
  ), p_reason);
  PERFORM set_config('itap.merge_context', 'off', true);
  RETURN NEXT merge_row;
END;
$$;

CREATE FUNCTION itap.rollback_merge(hasura_session json, p_merge_id uuid)
RETURNS SETOF itap.identity_merges
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.session_user_id(hasura_session);
  merge_row itap.identity_merges;
  lock_id uuid;
BEGIN
  SELECT * INTO merge_row FROM itap.identity_merges WHERE organization_id = org AND id = p_merge_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM itap.raise_code('merge_not_found'); END IF;
  IF merge_row.status <> 'completed' THEN PERFORM itap.raise_code('merge_not_completed'); END IF;
  FOR lock_id IN
    SELECT i.id FROM itap.identities i
    WHERE i.organization_id = org AND (i.id = merge_row.target_identity_id OR i.id IN (
      SELECT s.source_identity_id FROM itap.identity_merge_sources s WHERE s.organization_id = org AND s.merge_id = p_merge_id
    ))
    ORDER BY i.id FOR UPDATE
  LOOP
    PERFORM itap.lock_identity_templates(lock_id);
  END LOOP;

  PERFORM set_config('itap.merge_context', 'on', true);
  -- Undo what the merge did to the target's profile link, unless it was changed since.
  IF merge_row.inherited_profile_id IS NOT NULL THEN
    UPDATE itap.identities SET profile_id = NULL
    WHERE organization_id = org AND id = merge_row.target_identity_id AND profile_id = merge_row.inherited_profile_id;
  ELSIF merge_row.inherited_primary THEN
    UPDATE itap.identities SET is_primary_for_profile = false
    WHERE organization_id = org AND id = merge_row.target_identity_id;
  END IF;

  -- Exactly the recorded rows, and only while they are still on the target (Review Focus 2).
  UPDATE itap.identity_photos p SET identity_id = m.from_identity_id
  FROM itap.identity_merge_moves m
  WHERE m.organization_id = org AND m.merge_id = p_merge_id AND m.entity = 'identity_photos'
    AND p.organization_id = org AND p.id = m.row_id AND p.identity_id = merge_row.target_identity_id;
  UPDATE itap.identity_embeddings e SET identity_id = m.from_identity_id
  FROM itap.identity_merge_moves m
  WHERE m.organization_id = org AND m.merge_id = p_merge_id AND m.entity = 'identity_embeddings'
    AND e.organization_id = org AND e.id = m.row_id AND e.identity_id = merge_row.target_identity_id;

  UPDATE itap.identities i
  SET status = s.previous_status,
      profile_id = s.previous_profile_id,
      is_primary_for_profile = s.previous_is_primary AND s.previous_profile_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM itap.identities o
        WHERE o.organization_id = org AND o.profile_id = s.previous_profile_id AND o.is_primary_for_profile
      )
  FROM itap.identity_merge_sources s
  WHERE s.organization_id = org AND s.merge_id = p_merge_id
    AND i.organization_id = org AND i.id = s.source_identity_id AND i.status = 'merged';

  UPDATE itap.identity_merges
  SET status = 'rolled_back', rolled_back_at = now(), rolled_back_by = itap.organization_member(org, actor)
  WHERE id = merge_row.id
  RETURNING * INTO merge_row;
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes)
  VALUES (org, actor, 'rollback', 'identity_merges', merge_row.id,
          jsonb_build_object('target_identity_id', merge_row.target_identity_id));
  PERFORM set_config('itap.merge_context', 'off', true);
  RETURN NEXT merge_row;
END;
$$;

CREATE FUNCTION itap.split_identity(hasura_session json, p_identity uuid, p_embedding_ids uuid[], p_photo_ids uuid[])
RETURNS SETOF itap.identities
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  original itap.identities;
  created itap.identities;
  embeddings uuid[];
  photos uuid[];
  found_count int;
BEGIN
  SELECT * INTO original FROM itap.identities WHERE organization_id = org AND id = p_identity FOR UPDATE;
  IF NOT FOUND THEN PERFORM itap.raise_code('identity_not_found'); END IF;
  IF original.status = 'merged' THEN PERFORM itap.raise_code('identity_already_merged'); END IF;
  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO embeddings FROM unnest(p_embedding_ids) x WHERE x IS NOT NULL;
  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO photos FROM unnest(p_photo_ids) x WHERE x IS NOT NULL;
  IF cardinality(embeddings) + cardinality(photos) = 0 THEN PERFORM itap.raise_code('split_rows_required'); END IF;
  SELECT (SELECT count(*) FROM itap.identity_embeddings
          WHERE organization_id = org AND identity_id = p_identity AND id = ANY (embeddings))
       + (SELECT count(*) FROM itap.identity_photos
          WHERE organization_id = org AND identity_id = p_identity AND id = ANY (photos))
    INTO found_count;
  IF found_count <> cardinality(embeddings) + cardinality(photos) THEN PERFORM itap.raise_code('split_row_not_found'); END IF;

  PERFORM set_config('itap.merge_context', 'on', true);
  -- Unlinked and unverified; consent-driven matching and sandbox flags, and custom fields (so required custom
  -- attributes stay satisfied), carry over from the original.
  INSERT INTO itap.identities (organization_id, status, source, matching_enabled, is_synthetic, custom_fields)
  VALUES (org, 'unverified', 'split', original.matching_enabled, original.is_synthetic, original.custom_fields)
  RETURNING * INTO created;
  PERFORM itap.lock_identity_templates(least(original.id, created.id));
  PERFORM itap.lock_identity_templates(greatest(original.id, created.id));
  UPDATE itap.identity_photos SET identity_id = created.id WHERE organization_id = org AND id = ANY (photos);
  UPDATE itap.identity_embeddings SET identity_id = created.id WHERE organization_id = org AND id = ANY (embeddings);
  IF original.primary_photo_file_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM itap.identity_photos
    WHERE organization_id = org AND id = ANY (photos) AND file_id = original.primary_photo_file_id
  ) THEN
    UPDATE itap.identities SET primary_photo_file_id = NULL WHERE organization_id = org AND id = original.id;
    UPDATE itap.identities SET primary_photo_file_id = original.primary_photo_file_id
    WHERE organization_id = org AND id = created.id;
  END IF;
  PERFORM set_config('itap.merge_context', 'off', true);
  RETURN QUERY SELECT * FROM itap.identities WHERE organization_id = org AND id = created.id;
END;
$$;

-- Shared body of approve/reject (not tracked).
CREATE FUNCTION itap.decide_verification(hasura_session json, p_request uuid, p_reason text, p_decision text)
RETURNS itap.verification_requests
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.session_user_id(hasura_session);
  request itap.verification_requests;
BEGIN
  SELECT * INTO request FROM itap.verification_requests WHERE organization_id = org AND id = p_request FOR UPDATE;
  IF NOT FOUND THEN PERFORM itap.raise_code('verification_not_found'); END IF;
  IF request.status <> 'pending' THEN PERFORM itap.raise_code('verification_not_pending'); END IF;
  UPDATE itap.verification_requests
  SET status = p_decision, decided_by = itap.organization_member(org, actor), decided_at = now(),
      reason = coalesce(p_reason, reason)
  WHERE id = request.id
  RETURNING * INTO request;
  IF p_decision = 'approved' THEN
    UPDATE itap.identities SET status = 'verified' WHERE organization_id = org AND id = request.identity_id;
  END IF;
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes, reason)
  VALUES (org, actor, CASE p_decision WHEN 'approved' THEN 'approve' ELSE 'reject' END, 'verification_requests',
          request.id, jsonb_build_object('identity_id', request.identity_id, 'status', p_decision), p_reason);
  RETURN request;
END;
$$;

CREATE FUNCTION itap.approve_verification(hasura_session json, p_request uuid, p_reason text DEFAULT NULL)
RETURNS SETOF itap.verification_requests
LANGUAGE sql VOLATILE
SET search_path = pg_catalog, itap
AS $$
  SELECT * FROM itap.decide_verification(hasura_session, p_request, p_reason, 'approved');
$$;

CREATE FUNCTION itap.reject_verification(hasura_session json, p_request uuid, p_reason text DEFAULT NULL)
RETURNS SETOF itap.verification_requests
LANGUAGE sql VOLATILE
SET search_path = pg_catalog, itap
AS $$
  SELECT * FROM itap.decide_verification(hasura_session, p_request, p_reason, 'rejected');
$$;
