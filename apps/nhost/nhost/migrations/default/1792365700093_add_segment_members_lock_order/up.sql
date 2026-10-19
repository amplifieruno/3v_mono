-- add_segment_members lock order (slice 6 task 2, carry-over from task 1 review). Membership writers lock in one
-- order: subjects (identities / profiles FOR KEY SHARE, id order) -> segment row (FOR UPDATE) -> member rows (the
-- member_count trigger updates the same segment row). merge_identities locks identities FOR UPDATE first and then
-- touches segment rows, so taking the subjects first removes the deadlock between a merge and a manual add, and a
-- subject's status cannot change between the identity_merged check and the insert. sync_segment_members uses the
-- same order. Behavior otherwise as in *_segment_members_fix_round1.
CREATE OR REPLACE FUNCTION itap.add_segment_members(hasura_session json, p_segment uuid, p_ids uuid[])
RETURNS SETOF itap.segment_members
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org constant uuid := itap.session_organization(hasura_session);
  me constant uuid := itap.organization_member(itap.session_organization(hasura_session), itap.session_user_id(hasura_session));
  seg itap.segments;
  seg_target text;
  ids uuid[];
  n_found integer;
  n_merged integer := 0;
  ts constant timestamptz := now();
BEGIN
  -- target is immutable: read without a lock to know which subjects to lock first.
  SELECT s.target INTO seg_target FROM itap.segments s WHERE s.organization_id = org AND s.id = p_segment;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('segment_not_found');
  END IF;
  ids := ARRAY(SELECT DISTINCT x FROM unnest(p_ids) x WHERE x IS NOT NULL ORDER BY x);
  IF seg_target = 'identities' THEN
    SELECT count(*), count(*) FILTER (WHERE l.status = 'merged') INTO n_found, n_merged
    FROM (
      SELECT i.id, i.status FROM itap.identities i
      WHERE i.organization_id = org AND i.id = ANY (ids) ORDER BY i.id FOR KEY SHARE
    ) l;
  ELSE
    SELECT count(*) INTO n_found
    FROM (SELECT p.id FROM itap.profiles p WHERE p.organization_id = org AND p.id = ANY (ids) ORDER BY p.id FOR KEY SHARE) l;
  END IF;

  SELECT * INTO seg FROM itap.segments s WHERE s.organization_id = org AND s.id = p_segment FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('segment_not_found');
  END IF;
  IF seg.status = 'archived' THEN
    PERFORM itap.raise_code('segment_archived');
  END IF;
  IF n_found <> cardinality(ids) THEN
    PERFORM itap.raise_code('segment_member_not_found');
  END IF;
  IF n_merged > 0 THEN
    PERFORM itap.raise_code('identity_merged');
  END IF;

  -- Pin rule members: close their rule rows (statement 1), then open manual rows for everyone without an active
  -- manual row (statement 2; the partial unique index guarantees one open row per subject).
  UPDATE itap.segment_members m SET removed_at = ts
  WHERE m.organization_id = org AND m.segment_id = seg.id AND m.removed_at IS NULL AND m.source = 'rule'
    AND coalesce(m.identity_id, m.profile_id) = ANY (ids);
  INSERT INTO itap.segment_members (organization_id, segment_id, target, identity_id, profile_id, source, added_by, added_at)
  SELECT org, seg.id, seg.target,
         CASE WHEN seg.target = 'identities' THEN x END, CASE WHEN seg.target = 'profiles' THEN x END,
         'manual', me, ts
  FROM unnest(ids) x
  WHERE NOT EXISTS (
    SELECT 1 FROM itap.segment_members m
    WHERE m.organization_id = org AND m.segment_id = seg.id AND m.removed_at IS NULL
      AND coalesce(m.identity_id, m.profile_id) = x
  )
  ORDER BY x;

  RETURN QUERY
  SELECT m.* FROM itap.segment_members m
  WHERE m.organization_id = org AND m.segment_id = seg.id AND m.removed_at IS NULL AND m.source = 'manual'
    AND coalesce(m.identity_id, m.profile_id) = ANY (ids)
  ORDER BY m.added_at, m.id;
END;
$$;
