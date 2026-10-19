-- Restores sync_segment_members of *_create_sync_segment_members.
CREATE OR REPLACE FUNCTION itap.sync_segment_members(hasura_session json, p_segment uuid, p_ids uuid[], p_at timestamptz)
RETURNS SETOF itap_results.segment_sync_results
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org constant uuid := itap.session_organization(hasura_session);
  seg itap.segments;
  seg_kind text;
  seg_target text;
  tz text;
  ids uuid[];
  live uuid[];
  n_added integer;
  n_removed integer;
BEGIN
  IF p_at IS NULL THEN
    PERFORM itap.raise_code('segment_evaluation_time_required');
  END IF;
  -- kind and target are immutable: read without a lock to know which subjects to lock first.
  SELECT s.kind, s.target INTO seg_kind, seg_target FROM itap.segments s WHERE s.organization_id = org AND s.id = p_segment;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('segment_not_found');
  END IF;
  IF seg_kind <> 'dynamic' THEN
    PERFORM itap.raise_code('segment_not_dynamic');
  END IF;
  ids := ARRAY(SELECT DISTINCT x FROM unnest(p_ids) x WHERE x IS NOT NULL ORDER BY x);
  IF seg_target = 'identities' THEN
    SELECT coalesce(array_agg(l.id ORDER BY l.id) FILTER (WHERE l.status <> 'merged'), '{}') INTO live
    FROM (
      SELECT i.id, i.status FROM itap.identities i
      WHERE i.organization_id = org AND i.id = ANY (ids) ORDER BY i.id FOR KEY SHARE
    ) l;
  ELSE
    SELECT coalesce(array_agg(l.id ORDER BY l.id), '{}') INTO live
    FROM (SELECT p.id FROM itap.profiles p WHERE p.organization_id = org AND p.id = ANY (ids) ORDER BY p.id FOR KEY SHARE) l;
  END IF;

  SELECT * INTO seg FROM itap.segments s WHERE s.organization_id = org AND s.id = p_segment FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('segment_not_found');
  END IF;
  IF seg.last_evaluated_at IS NOT NULL AND p_at < seg.last_evaluated_at THEN
    RETURN QUERY SELECT org, seg.id, 0, 0, seg.member_count, p_at, true;
    RETURN;
  END IF;
  SELECT o.timezone INTO tz FROM itap.organizations o WHERE o.id = org;
  IF NOT itap.segment_active_at(seg, tz, p_at) THEN
    live := '{}';
  END IF;

  UPDATE itap.segment_members m SET removed_at = greatest(p_at, m.added_at)
  WHERE m.organization_id = org AND m.segment_id = seg.id AND m.removed_at IS NULL AND m.source = 'rule'
    AND NOT (coalesce(m.identity_id, m.profile_id) = ANY (live));
  GET DIAGNOSTICS n_removed = ROW_COUNT;
  INSERT INTO itap.segment_members (organization_id, segment_id, target, identity_id, profile_id, source, added_at)
  SELECT org, seg.id, seg.target,
         CASE WHEN seg.target = 'identities' THEN x END, CASE WHEN seg.target = 'profiles' THEN x END,
         'rule', p_at
  FROM unnest(live) x
  WHERE NOT EXISTS (
    SELECT 1 FROM itap.segment_members m
    WHERE m.organization_id = org AND m.segment_id = seg.id AND m.removed_at IS NULL
      AND coalesce(m.identity_id, m.profile_id) = x
  )
  ORDER BY x;
  GET DIAGNOSTICS n_added = ROW_COUNT;
  UPDATE itap.segments SET last_evaluated_at = p_at WHERE organization_id = org AND id = seg.id;

  RETURN QUERY
  SELECT org, s.id, n_added, n_removed, s.member_count, p_at, false
  FROM itap.segments s WHERE s.organization_id = org AND s.id = seg.id;
END;
$$;
