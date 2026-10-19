-- Segment membership (spec §6.5): one table for both targets. A row is one membership period of one subject:
-- opened (added_at) by a person (source manual, added_by) or by evaluation (source rule), closed (removed_at,
-- removed_by for manual removals), never reopened, never deleted (the churn history; deleted only with the segment,
-- the subject or the organization). At most one open row per (segment, subject).
-- Manual rows change only through add_segment_members / remove_segment_members (org_admin has select only);
-- rule rows only through the evaluator (sync_segment_members). Not audited (high churn): the rows are the history.
-- segments.member_count = open rows, maintained per statement (one segment row update per statement, not per
-- member row, to keep the segment row cool during large syncs).
CREATE TABLE itap.segment_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  segment_id uuid NOT NULL,
  -- Valid by the segment FK (segments.target references segment_targets).
  target text NOT NULL,
  identity_id uuid,
  profile_id uuid,
  source text NOT NULL REFERENCES itap.segment_member_sources (value),
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT segment_members_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT segment_members_subject_matches_target CHECK (
    (target = 'identities' AND identity_id IS NOT NULL AND profile_id IS NULL)
    OR (target = 'profiles' AND profile_id IS NOT NULL AND identity_id IS NULL)
  ),
  CONSTRAINT segment_members_removed_after_added CHECK (removed_at IS NULL OR removed_at >= added_at),
  CONSTRAINT segment_members_removed_by_needs_removed_at CHECK (removed_by IS NULL OR removed_at IS NOT NULL),
  CONSTRAINT segment_members_segment_fkey FOREIGN KEY (organization_id, segment_id, target)
    REFERENCES itap.segments (organization_id, id, target) ON DELETE CASCADE,
  CONSTRAINT segment_members_identity_fkey FOREIGN KEY (organization_id, identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT segment_members_profile_fkey FOREIGN KEY (organization_id, profile_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT segment_members_added_by_fkey FOREIGN KEY (organization_id, added_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT segment_members_removed_by_fkey FOREIGN KEY (organization_id, removed_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE UNIQUE INDEX segment_members_active_identity_key ON itap.segment_members (organization_id, segment_id, identity_id)
  WHERE removed_at IS NULL AND identity_id IS NOT NULL;
CREATE UNIQUE INDEX segment_members_active_profile_key ON itap.segment_members (organization_id, segment_id, profile_id)
  WHERE removed_at IS NULL AND profile_id IS NOT NULL;
CREATE INDEX segment_members_organization_id_segment_id_target_idx
  ON itap.segment_members (organization_id, segment_id, target, added_at);
CREATE INDEX segment_members_organization_id_identity_id_idx ON itap.segment_members (organization_id, identity_id);
CREATE INDEX segment_members_organization_id_profile_id_idx ON itap.segment_members (organization_id, profile_id);
CREATE INDEX segment_members_organization_id_added_by_idx ON itap.segment_members (organization_id, added_by);
CREATE INDEX segment_members_organization_id_removed_by_idx ON itap.segment_members (organization_id, removed_by);
CREATE INDEX segment_members_organization_id_source_idx ON itap.segment_members (organization_id, source);
CREATE TRIGGER segment_members_set_updated_at BEFORE UPDATE ON itap.segment_members
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();

-- History is immutable: only an open row's removed_at / removed_by may be set (once); direct deletes are refused
-- (cascades from the segment, subject or organization run inside the FK trigger, at trigger depth >= 2).
CREATE FUNCTION itap.segment_members_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() < 2 THEN
      PERFORM itap.raise_code('segment_member_delete_forbidden');
    END IF;
    RETURN OLD;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['removed_at', 'removed_by', 'updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['removed_at', 'removed_by', 'updated_at'])
     OR (OLD.removed_at IS NOT NULL
         AND (NEW.removed_at IS DISTINCT FROM OLD.removed_at OR NEW.removed_by IS DISTINCT FROM OLD.removed_by)) THEN
    PERFORM itap.raise_code('segment_member_immutable');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER segment_members_guard BEFORE UPDATE OR DELETE ON itap.segment_members
  FOR EACH ROW EXECUTE FUNCTION itap.segment_members_guard();

-- member_count: per statement, the change of open rows per segment (transition tables; one trigger per event).
CREATE FUNCTION itap.segment_members_count() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE itap.segments s SET member_count = s.member_count + d.n
    FROM (SELECT organization_id, segment_id, count(*) AS n FROM new_rows WHERE removed_at IS NULL
          GROUP BY organization_id, segment_id) d
    WHERE s.organization_id = d.organization_id AND s.id = d.segment_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE itap.segments s SET member_count = s.member_count + d.n
    FROM (SELECT n.organization_id, n.segment_id,
                 sum((n.removed_at IS NULL)::int - (o.removed_at IS NULL)::int) AS n
          FROM new_rows n JOIN old_rows o ON o.id = n.id
          GROUP BY n.organization_id, n.segment_id) d
    WHERE s.organization_id = d.organization_id AND s.id = d.segment_id AND d.n <> 0;
  ELSE
    UPDATE itap.segments s SET member_count = s.member_count - d.n
    FROM (SELECT organization_id, segment_id, count(*) AS n FROM old_rows WHERE removed_at IS NULL
          GROUP BY organization_id, segment_id) d
    WHERE s.organization_id = d.organization_id AND s.id = d.segment_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER segment_members_count_insert AFTER INSERT ON itap.segment_members
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION itap.segment_members_count();
CREATE TRIGGER segment_members_count_update AFTER UPDATE ON itap.segment_members
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION itap.segment_members_count();
CREATE TRIGGER segment_members_count_delete AFTER DELETE ON itap.segment_members
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION itap.segment_members_count();
