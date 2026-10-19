-- Restores add_segment_members of *_segment_members_fix_round1 (segment locked before the subjects).
CREATE OR REPLACE FUNCTION itap.add_segment_members(hasura_session json, p_segment uuid, p_ids uuid[])
RETURNS SETOF itap.segment_members
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org constant uuid := itap.session_organization(hasura_session);
  me constant uuid := itap.organization_member(itap.session_organization(hasura_session), itap.session_user_id(hasura_session));
  seg itap.segments;
  ids uuid[];
  n_found integer;
  ts constant timestamptz := now();
BEGIN
  SELECT * INTO seg FROM itap.segments s WHERE s.organization_id = org AND s.id = p_segment FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('segment_not_found');
  END IF;
  IF seg.status = 'archived' THEN
    PERFORM itap.raise_code('segment_archived');
  END IF;
  ids := ARRAY(SELECT DISTINCT x FROM unnest(p_ids) x WHERE x IS NOT NULL ORDER BY x);
  IF seg.target = 'identities' THEN
    SELECT count(*) INTO n_found FROM itap.identities i WHERE i.organization_id = org AND i.id = ANY (ids);
  ELSE
    SELECT count(*) INTO n_found FROM itap.profiles p WHERE p.organization_id = org AND p.id = ANY (ids);
  END IF;
  IF n_found <> cardinality(ids) THEN
    PERFORM itap.raise_code('segment_member_not_found');
  END IF;
  IF seg.target = 'identities' AND EXISTS (
    SELECT 1 FROM itap.identities i WHERE i.organization_id = org AND i.id = ANY (ids) AND i.status = 'merged'
  ) THEN
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
