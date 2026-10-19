-- merge_identities (slice 6 task 2, review round 1): the target's open membership row is read FOR UPDATE before it is
-- pinned, so an evaluation closing that rule row concurrently is serialized with the merge; a pin move is recorded
-- only when a row was actually pinned. Otherwise the *_merges_pin_target_rule_members definition.
CREATE OR REPLACE FUNCTION itap.merge_identities(hasura_session json, p_target uuid, p_sources uuid[], p_reason text DEFAULT NULL::text)
 RETURNS SETOF itap.identity_merges
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
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
  entries_folded int;
  lock_id uuid;
  member_row itap.segment_members;
  opened_id uuid;
  memberships_moved int := 0;
  target_source text;
  pinned_id uuid;
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
  INSERT INTO itap.identity_merge_moves (organization_id, merge_id, entity, row_id, from_identity_id, snapshot)
  SELECT org, merge_row.id, 'watch_list_entries', f.entry_id, f.from_subject_id, f.removed
  FROM itap.fold_watch_list_entries(org, 'identity_id', sources, p_target) f;
  GET DIAGNOSTICS entries_folded = ROW_COUNT;

  -- Open manual segment memberships of the sources move to the target: the source row is closed, a target row is
  -- opened unless the target is already an open member of that segment; both recorded for an exact rollback.
  -- Rule rows are left to the evaluator (it skips merged identities).
  FOR member_row IN
    SELECT m.* FROM itap.segment_members m
    WHERE m.organization_id = org AND m.identity_id = ANY (sources) AND m.removed_at IS NULL AND m.source = 'manual'
    ORDER BY m.segment_id, m.added_at, m.id
  LOOP
    UPDATE itap.segment_members SET removed_at = now(), removed_by = itap.organization_member(org, actor)
    WHERE organization_id = org AND id = member_row.id;
    INSERT INTO itap.identity_merge_moves (organization_id, merge_id, entity, row_id, from_identity_id)
    VALUES (org, merge_row.id, 'segment_members', member_row.id, member_row.identity_id);
    memberships_moved := memberships_moved + 1;
    -- Locked: a concurrent evaluation closing the target's rule row is waited for (the row then no longer qualifies).
    SELECT t.source INTO target_source FROM itap.segment_members t
    WHERE t.organization_id = org AND t.segment_id = member_row.segment_id AND t.identity_id = p_target AND t.removed_at IS NULL
    FOR UPDATE;
    IF target_source = 'rule' THEN
      -- The target is only a rule member: pin it like add_segment_members (rule row closed, manual row opened at the
      -- same instant), so a later evaluation cannot drop the membership the source was given by hand.
      UPDATE itap.segment_members SET removed_at = now()
      WHERE organization_id = org AND segment_id = member_row.segment_id AND identity_id = p_target
        AND removed_at IS NULL AND source = 'rule'
      RETURNING id INTO pinned_id;
      IF pinned_id IS NOT NULL THEN
        INSERT INTO itap.identity_merge_moves (organization_id, merge_id, entity, row_id, from_identity_id)
        VALUES (org, merge_row.id, 'segment_members_pinned', pinned_id, p_target);
      END IF;
    END IF;
    IF target_source IS DISTINCT FROM 'manual' THEN
      INSERT INTO itap.segment_members (organization_id, segment_id, target, identity_id, source, added_by, added_at)
      VALUES (org, member_row.segment_id, 'identities', p_target, 'manual', member_row.added_by, now())
      RETURNING id INTO opened_id;
      INSERT INTO itap.identity_merge_moves (organization_id, merge_id, entity, row_id, from_identity_id)
      VALUES (org, merge_row.id, 'segment_members_opened', opened_id, member_row.identity_id);
    END IF;
  END LOOP;

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
    'embeddings_moved', embeddings_moved, 'watch_list_entries_folded', entries_folded, 'segment_memberships_moved', memberships_moved,
    'inherited_profile_id', merge_row.inherited_profile_id
  ), p_reason);
  PERFORM set_config('itap.merge_context', 'off', true);
  RETURN NEXT merge_row;
END;
$function$;
