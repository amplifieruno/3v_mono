-- Manual segment membership (org_admin; segment_members itself is read-only for org_admin). Both functions lock the
-- segment row first (then member rows; the member_count trigger updates the same segment row), resolve every id in
-- the session organization and work for manual and dynamic segments: manual rows are never touched by evaluation,
-- and remove_segment_members never touches rule rows.
--
-- add_segment_members: every id must be a subject of the segment target in the organization (else
-- segment_member_not_found, nothing changes); archived segments refuse new members (segment_archived). An active
-- manual row is kept (idempotent); an active rule row is closed and a manual row opened at the same instant (the
-- member is pinned). Returns the active manual rows of the ids.
CREATE FUNCTION itap.add_segment_members(hasura_session json, p_segment uuid, p_ids uuid[])
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

-- remove_segment_members: closes the active manual rows of the ids (removed_by = caller); other ids (rule members,
-- non-members, foreign ids) are skipped. Returns the closed rows.
CREATE FUNCTION itap.remove_segment_members(hasura_session json, p_segment uuid, p_ids uuid[])
RETURNS SETOF itap.segment_members
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org constant uuid := itap.session_organization(hasura_session);
  me constant uuid := itap.organization_member(itap.session_organization(hasura_session), itap.session_user_id(hasura_session));
BEGIN
  PERFORM 1 FROM itap.segments s WHERE s.organization_id = org AND s.id = p_segment FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('segment_not_found');
  END IF;
  RETURN QUERY
  UPDATE itap.segment_members m SET removed_at = now(), removed_by = me
  WHERE m.organization_id = org AND m.segment_id = p_segment AND m.removed_at IS NULL AND m.source = 'manual'
    AND coalesce(m.identity_id, m.profile_id) = ANY (p_ids)
  RETURNING m.*;
END;
$$;
