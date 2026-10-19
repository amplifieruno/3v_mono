-- Segment membership fixes (slice 6 task 1, review round 1):
-- * segment history is kept: segment_members / segment_daily_stats -> segments become NO ACTION (a segment with
--   history is archived, not deleted; an organization delete still cascades through organization_id);
-- * rule rows only on dynamic segments (segment_member_rule_on_manual);
-- * identity merges fold manual memberships (merge_identities / rollback_merge set itap.merge_context): under that
--   flag the history guard lets rollback reopen a closed row and delete the row the merge opened;
-- * add_segment_members refuses merged identities (identity_merged).
ALTER TABLE itap.segment_members DROP CONSTRAINT segment_members_segment_fkey;
ALTER TABLE itap.segment_members ADD CONSTRAINT segment_members_segment_fkey FOREIGN KEY (organization_id, segment_id, target)
  REFERENCES itap.segments (organization_id, id, target) ON DELETE NO ACTION;
ALTER TABLE itap.segment_daily_stats DROP CONSTRAINT segment_daily_stats_segment_fkey;
ALTER TABLE itap.segment_daily_stats ADD CONSTRAINT segment_daily_stats_segment_fkey FOREIGN KEY (organization_id, segment_id)
  REFERENCES itap.segments (organization_id, id) ON DELETE NO ACTION;

CREATE FUNCTION itap.segment_members_check_source() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF NEW.source = 'rule' AND EXISTS (
    SELECT 1 FROM itap.segments s WHERE s.organization_id = NEW.organization_id AND s.id = NEW.segment_id AND s.kind = 'manual'
  ) THEN
    PERFORM itap.raise_code('segment_member_rule_on_manual');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER segment_members_check_source BEFORE INSERT ON itap.segment_members
  FOR EACH ROW EXECUTE FUNCTION itap.segment_members_check_source();

CREATE OR REPLACE FUNCTION itap.segment_members_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  merging constant boolean := coalesce(current_setting('itap.merge_context', true), '') = 'on';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() < 2 AND NOT merging THEN
      PERFORM itap.raise_code('segment_member_delete_forbidden');
    END IF;
    RETURN OLD;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['removed_at', 'removed_by', 'updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['removed_at', 'removed_by', 'updated_at'])
     OR (OLD.removed_at IS NOT NULL AND NOT (merging AND NEW.removed_at IS NULL AND NEW.removed_by IS NULL)
         AND (NEW.removed_at IS DISTINCT FROM OLD.removed_at OR NEW.removed_by IS DISTINCT FROM OLD.removed_by)) THEN
    PERFORM itap.raise_code('segment_member_immutable');
  END IF;
  RETURN NEW;
END;
$$;

-- add_segment_members: as in *_create_segment_membership_functions, plus identity_merged.
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
