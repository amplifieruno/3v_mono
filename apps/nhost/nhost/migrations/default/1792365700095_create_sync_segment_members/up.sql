-- Rule membership sync (spec §8.1 sync_segment_members; the evaluator's only writer). Admin secret only: called by
-- the evaluate_segment action / evaluation crons with the organization session (backend actor). p_ids = the subjects
-- the translator's where matched at p_at.
--   * Lock order of membership writers: subjects (FOR KEY SHARE, id order) -> segment row (FOR UPDATE) -> member rows
--     (as add_segment_members; merges lock identities first too). Concurrent syncs serialize on the segment row.
--   * Ids outside the organization or of another target are ignored; merged identities never become members.
--   * Rule rows are opened (added_at = p_at) for matched subjects without an open row; a subject with an open manual
--     row keeps it (no rule row). Open rule rows of subjects not matched are closed (removed_at = p_at). Manual rows
--     are never touched (Review Focus 1).
--   * A segment not active at p_at (itap.segment_active_at) matches nobody: all its rule rows close.
--   * Idempotent; an evaluation older than last_evaluated_at is stale and changes nothing (a slow concurrent
--     evaluation cannot undo a newer one). Manual segments are refused (segment_not_dynamic).
CREATE TABLE itap_results.segment_sync_results (
  organization_id uuid NOT NULL,
  segment_id uuid NOT NULL,
  added integer NOT NULL,
  removed integer NOT NULL,
  member_count integer NOT NULL,
  evaluated_at timestamptz NOT NULL,
  stale boolean NOT NULL
);

CREATE FUNCTION itap.sync_segment_members(hasura_session json, p_segment uuid, p_ids uuid[], p_at timestamptz)
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
