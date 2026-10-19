-- Slice 8 task 4 fix round 1 — distribution epochs:
-- * itap.policy_urgent_epochs: one row per urgent epoch (append-only, ro, not audited), written by bump_policy_epoch,
--   so convergence is measured from the EARLIEST urgent epoch a terminal has not applied (terminal_sync_status), not
--   from the latest one. Existing urgent epochs are backfilled from organization_settings.policy_urgent_at.
-- * every emergency override end is urgent (a lock_all ending re-enables policy decisions that may deny).
-- * lazy bumps: a person joining (open row) a segment referenced by an enforced policy subject (deferred, once per
--   transaction and organization, like the credential-withdrawal bumps) and an access point status / direction /
--   area change, so terminal allow lists and access-point data converge within the lazy window.
CREATE TABLE itap.policy_urgent_epochs (
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  epoch bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, epoch)
);
INSERT INTO itap.policy_urgent_epochs (organization_id, epoch, created_at)
SELECT s.organization_id, s.policy_urgent_epoch, coalesce(s.policy_urgent_at, now())
FROM itap.organization_settings s WHERE s.policy_urgent_epoch > 0;

CREATE OR REPLACE FUNCTION itap.bump_policy_epoch(p_org uuid, p_urgent boolean) RETURNS bigint
LANGUAGE sql VOLATILE
SET search_path = pg_catalog, itap
AS $$
  WITH bumped AS (
    UPDATE itap.organization_settings
    SET policy_epoch = policy_epoch + 1,
        policy_epoch_at = now(),
        policy_urgent_epoch = CASE WHEN p_urgent THEN policy_epoch + 1 ELSE policy_urgent_epoch END,
        policy_urgent_at = CASE WHEN p_urgent THEN now() ELSE policy_urgent_at END
    WHERE organization_id = p_org
    RETURNING organization_id, policy_epoch
  ), logged AS (
    INSERT INTO itap.policy_urgent_epochs (organization_id, epoch)
    SELECT b.organization_id, b.policy_epoch FROM bumped b WHERE p_urgent
    RETURNING epoch
  )
  SELECT b.policy_epoch FROM bumped b;
$$;

CREATE OR REPLACE FUNCTION itap.policy_epoch_on_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  old_effect text;
  new_effect text;
  new_max_risk numeric;
BEGIN
  IF TG_TABLE_NAME = 'access_policies' THEN
    IF TG_OP = 'DELETE' THEN
      IF OLD.current_version_id IS NOT NULL THEN
        SELECT effect INTO old_effect FROM itap.access_policy_versions
        WHERE organization_id = OLD.organization_id AND id = OLD.current_version_id;
        PERFORM itap.bump_policy_epoch(OLD.organization_id, old_effect IS DISTINCT FROM 'deny');
      END IF;
      RETURN OLD;
    END IF;
    IF NEW.current_version_id IS DISTINCT FROM OLD.current_version_id THEN
      SELECT effect INTO old_effect FROM itap.access_policy_versions
      WHERE organization_id = OLD.organization_id AND id = OLD.current_version_id;
      SELECT effect, max_risk INTO new_effect, new_max_risk FROM itap.access_policy_versions
      WHERE organization_id = NEW.organization_id AND id = NEW.current_version_id;
      PERFORM itap.bump_policy_epoch(
        NEW.organization_id,
        new_effect IS NOT DISTINCT FROM 'deny' OR old_effect IS NOT DISTINCT FROM 'allow'
          OR (new_effect IS NOT DISTINCT FROM 'allow' AND new_max_risk IS NOT NULL)
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'access_grants' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM itap.bump_policy_epoch(NEW.organization_id, false);
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM itap.bump_policy_epoch(OLD.organization_id, true);
      RETURN OLD;
    ELSIF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
      PERFORM itap.bump_policy_epoch(NEW.organization_id, true);
    END IF;
  ELSIF TG_TABLE_NAME = 'emergency_overrides' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM itap.bump_policy_epoch(NEW.organization_id, true);
    ELSIF TG_OP = 'UPDATE' AND NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
      PERFORM itap.bump_policy_epoch(NEW.organization_id, true);
    END IF;
  ELSIF TG_TABLE_NAME = 'access_points' THEN
    PERFORM itap.bump_policy_epoch(NEW.organization_id, false);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER access_points_policy_epoch AFTER UPDATE OF status, direction, area_id ON itap.access_points
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.direction IS DISTINCT FROM NEW.direction
                     OR OLD.area_id IS DISTINCT FROM NEW.area_id)
  EXECUTE FUNCTION itap.policy_epoch_on_change();

-- Deferred lazy bump: an open membership row in a segment that is a subject of an enforced version.
CREATE FUNCTION itap.access_credentials_granted() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  flag text := 'itap.policy_granted_' || replace(NEW.organization_id::text, '-', '');
BEGIN
  IF coalesce(current_setting(flag, true), '') = 'on' THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM itap.organizations x WHERE x.id = NEW.organization_id)
     OR NOT itap.enforced_subject_exists(NEW.organization_id, 'segment', NEW.segment_id) THEN
    RETURN NULL;
  END IF;
  PERFORM itap.bump_policy_epoch(NEW.organization_id, false);
  PERFORM set_config(flag, 'on', true);
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER access_credentials_granted AFTER INSERT ON itap.segment_members
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.removed_at IS NULL)
  EXECUTE FUNCTION itap.access_credentials_granted();
