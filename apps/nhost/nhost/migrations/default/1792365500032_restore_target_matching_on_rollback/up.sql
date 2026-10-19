-- Rollback restores the target's matching_enabled (spec §8.2): a target that inherited a profile whose biometric
-- consent is withdrawn got matching disabled by the link trigger; unlinking keeps the flag, so the merge now records
-- the target's previous value and rollback puts it back when it unlinks the inherited profile.
ALTER TABLE itap.identity_merges ADD COLUMN target_previous_matching_enabled boolean;

CREATE OR REPLACE FUNCTION itap.merge_identities(hasura_session json, p_target uuid, p_sources uuid[], p_reason text DEFAULT NULL)
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
  target_matching boolean;
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
  SELECT profile_id, matching_enabled INTO target_profile, target_matching
  FROM itap.identities WHERE organization_id = org AND id = p_target;
  inherit_primary := coalesce(inherit_primary, false)
    AND NOT (SELECT is_primary_for_profile FROM itap.identities WHERE organization_id = org AND id = p_target);
  FOR lock_id IN SELECT unnest(all_ids) ORDER BY 1 LOOP
    PERFORM itap.lock_identity_templates(lock_id);
  END LOOP;

  PERFORM set_config('itap.merge_context', 'on', true);
  INSERT INTO itap.identity_merges
    (organization_id, target_identity_id, reason, inherited_profile_id, inherited_primary, merged_by,
     target_previous_matching_enabled)
  VALUES (
    org, p_target, p_reason, CASE WHEN target_profile IS NULL THEN linked[1] END, inherit_primary,
    itap.organization_member(org, actor), target_matching
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

  -- Every open candidate touching a source is settled by this merge (rollback reopens exactly these).
  UPDATE itap.identity_duplicate_candidates SET status = 'merged', merge_id = merge_row.id
  WHERE organization_id = org AND status = 'open' AND (identity_a_id = ANY (sources) OR identity_b_id = ANY (sources));
  UPDATE itap.verification_requests SET status = 'cancelled', decided_at = now()
  WHERE organization_id = org AND status = 'pending' AND identity_id = ANY (sources);

  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes, reason)
  VALUES (org, actor, 'merge', 'identity_merges', merge_row.id, jsonb_build_object(
    'target_identity_id', p_target, 'source_identity_ids', to_jsonb(sources), 'photos_moved', photos_moved,
    'embeddings_moved', embeddings_moved, 'inherited_profile_id', merge_row.inherited_profile_id
  ), p_reason);
  PERFORM set_config('itap.merge_context', 'off', true);
  RETURN NEXT merge_row;
END;
$$;

CREATE OR REPLACE FUNCTION itap.rollback_merge(hasura_session json, p_merge_id uuid)
RETURNS SETOF itap.identity_merges
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.session_user_id(hasura_session);
  merge_row itap.identity_merges;
  lock_id uuid;
  moved_away int;
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
  -- Merges are undone newest first: a target merged later must be restored by rolling back that merge first.
  IF EXISTS (SELECT 1 FROM itap.identities
             WHERE organization_id = org AND id = merge_row.target_identity_id AND status = 'merged') THEN
    PERFORM itap.raise_code('merge_target_merged');
  END IF;
  -- Recorded rows that left the target since (e.g. a later split) cannot be restored exactly: refuse. Deleted rows
  -- are simply gone and do not block.
  SELECT count(*) INTO moved_away
  FROM itap.identity_merge_moves m
  LEFT JOIN itap.identity_photos p
    ON m.entity = 'identity_photos' AND p.organization_id = org AND p.id = m.row_id
  LEFT JOIN itap.identity_embeddings e
    ON m.entity = 'identity_embeddings' AND e.organization_id = org AND e.id = m.row_id
  WHERE m.organization_id = org AND m.merge_id = p_merge_id
    AND coalesce(p.identity_id, e.identity_id) IS DISTINCT FROM merge_row.target_identity_id
    AND coalesce(p.id, e.id) IS NOT NULL;
  IF moved_away > 0 THEN PERFORM itap.raise_code('merge_rows_moved:' || moved_away); END IF;

  PERFORM set_config('itap.merge_context', 'on', true);
  -- Undo what the merge did to the target's profile link, unless it was changed since.
  IF merge_row.inherited_profile_id IS NOT NULL THEN
    -- Unlinking keeps the flag the inherited profile's consent set: restore the target's own value.
    UPDATE itap.identities
    SET profile_id = NULL, matching_enabled = coalesce(merge_row.target_previous_matching_enabled, matching_enabled)
    WHERE organization_id = org AND id = merge_row.target_identity_id AND profile_id = merge_row.inherited_profile_id;
  ELSIF merge_row.inherited_primary THEN
    UPDATE itap.identities SET is_primary_for_profile = false
    WHERE organization_id = org AND id = merge_row.target_identity_id;
  END IF;

  -- Exactly the recorded rows (all still on the target, checked above); newer target rows stay (Review Focus 2).
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

  UPDATE itap.identity_duplicate_candidates SET status = 'open', merge_id = NULL
  WHERE organization_id = org AND merge_id = p_merge_id;
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
