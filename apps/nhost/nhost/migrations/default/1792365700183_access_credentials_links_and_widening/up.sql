-- Slice 8 final review: more changes reach the terminals through the policy epoch (deferred, once per transaction and
-- organization, like the credential-withdrawal triggers of migration 158).
-- * Urgent (access_credentials_withdrawn, which bumps for any table without a narrowing branch):
--   - identities: a linked identity is unlinked / relinked to another profile, or deleted while linked (the payload
--     maps faces to people; a merge rollback taking an inherited profile away goes through this path);
--   - areas: a path change (area move) changes which access points a target area covers.
-- * Lazy (access_credentials_granted, access widening so allow lists converge):
--   - identities: a new link (insert linked, or NULL -> profile);
--   - profiles: reactivation (status becomes active), access level raised when an enforced version has an
--     access_level subject (narrowed like the withdrawal); a type change is already urgent when it matters;
--   - segment_members: a closed row reopened (merge rollback), for segments referenced by an enforced version.
-- * segment_members DELETE withdraws only open rows (retention deleting closed rows is not a withdrawal).
-- Triggers use WHEN on OLD/NEW (no UPDATE OF column list: path and profile_id may be set by BEFORE triggers).
CREATE OR REPLACE FUNCTION itap.access_credentials_granted()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := NEW.organization_id;
  flag text := 'itap.policy_granted_' || replace(NEW.organization_id::text, '-', '');
  o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
  n jsonb := to_jsonb(NEW);
BEGIN
  IF coalesce(current_setting(flag, true), '') = 'on' THEN
    RETURN NULL;
  END IF;
  -- Organization cascade / gone: nothing to distribute.
  IF NOT EXISTS (SELECT 1 FROM itap.organizations x WHERE x.id = org) THEN
    RETURN NULL;
  END IF;
  IF TG_TABLE_NAME = 'segment_members' THEN
    IF NOT itap.enforced_subject_exists(org, 'segment', (n ->> 'segment_id')::uuid) THEN
      RETURN NULL;
    END IF;
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    IF NOT (
      (o ->> 'status' IS DISTINCT FROM n ->> 'status' AND n ->> 'status' = 'active')
      OR (coalesce(itap.access_rank(n ->> 'access_level'), 0) > coalesce(itap.access_rank(o ->> 'access_level'), 0)
          AND itap.enforced_subject_exists(org, 'access_level'))
    ) THEN
      RETURN NULL;
    END IF;
  END IF;
  PERFORM itap.bump_policy_epoch(org, false);
  PERFORM set_config(flag, 'on', true);
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER access_credentials_withdrawn AFTER UPDATE ON itap.identities
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.profile_id IS NOT NULL AND OLD.profile_id IS DISTINCT FROM NEW.profile_id)
  EXECUTE FUNCTION itap.access_credentials_withdrawn();
CREATE CONSTRAINT TRIGGER access_credentials_withdrawn_delete AFTER DELETE ON itap.identities
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.profile_id IS NOT NULL)
  EXECUTE FUNCTION itap.access_credentials_withdrawn();
CREATE CONSTRAINT TRIGGER access_credentials_granted AFTER INSERT ON itap.identities
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (NEW.profile_id IS NOT NULL)
  EXECUTE FUNCTION itap.access_credentials_granted();
CREATE CONSTRAINT TRIGGER access_credentials_granted_update AFTER UPDATE ON itap.identities
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.profile_id IS NULL AND NEW.profile_id IS NOT NULL)
  EXECUTE FUNCTION itap.access_credentials_granted();

CREATE CONSTRAINT TRIGGER access_credentials_granted AFTER UPDATE ON itap.profiles
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN ((OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'active')
        OR coalesce(itap.access_rank(NEW.access_level), 0) > coalesce(itap.access_rank(OLD.access_level), 0))
  EXECUTE FUNCTION itap.access_credentials_granted();

CREATE CONSTRAINT TRIGGER access_credentials_granted_reopen AFTER UPDATE ON itap.segment_members
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.removed_at IS NOT NULL AND NEW.removed_at IS NULL)
  EXECUTE FUNCTION itap.access_credentials_granted();

DROP TRIGGER access_credentials_withdrawn_delete ON itap.segment_members;
CREATE CONSTRAINT TRIGGER access_credentials_withdrawn_delete AFTER DELETE ON itap.segment_members
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.removed_at IS NULL)
  EXECUTE FUNCTION itap.access_credentials_withdrawn();

CREATE CONSTRAINT TRIGGER access_credentials_withdrawn AFTER UPDATE ON itap.areas
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.path IS DISTINCT FROM NEW.path)
  EXECUTE FUNCTION itap.access_credentials_withdrawn();
