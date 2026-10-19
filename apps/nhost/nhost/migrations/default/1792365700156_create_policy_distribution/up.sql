-- Policy distribution (spec §6.7, §8.5, SA_5 §2.1.4 bounded revocation convergence). Every change of what is
-- enforced bumps the organization's policy epoch (itap.bump_policy_epoch); a change that can only reduce access
-- is also recorded as the latest urgent epoch, which every reachable access terminal must reach within
-- policy_revocation_bound_seconds (sync_terminal_policies cron, task 4); other changes converge lazily.
--   access_policies.current_version_id changes (approval publishes, archive clears): urgent when the new version
--       denies or the replaced version allowed;
--   access_grants: insert lazy; revocation (or an SQL delete) urgent; consumption (used_at) no bump (the decision
--       that consumed it ran centrally); expiry needs no bump (terminals check validity themselves);
--   emergency_overrides: start of lock_all urgent, other starts lazy; end of unlock_all / evacuation urgent, end of
--       lock_all lazy.
-- Terminals record their epoch in devices.policy_version_synced / policy_synced_at / policy_sync_error (read-only).
-- Lock order: the changed policy / grant / override row first, the organization_settings row last.
ALTER TABLE itap.organization_settings
  ADD COLUMN policy_epoch bigint NOT NULL DEFAULT 0,
  ADD COLUMN policy_epoch_at timestamptz,
  ADD COLUMN policy_urgent_epoch bigint NOT NULL DEFAULT 0,
  ADD COLUMN policy_urgent_at timestamptz,
  ADD COLUMN policy_revocation_bound_seconds integer NOT NULL DEFAULT 60,
  ADD CONSTRAINT organization_settings_policy_epoch_consistent CHECK (policy_urgent_epoch BETWEEN 0 AND policy_epoch),
  ADD CONSTRAINT organization_settings_policy_revocation_bound_range CHECK (policy_revocation_bound_seconds BETWEEN 10 AND 3600);

-- The epoch counters are system state: they neither bump updated_at nor write audit rows.
DROP TRIGGER organization_settings_set_updated_at ON itap.organization_settings;
CREATE TRIGGER organization_settings_set_updated_at BEFORE UPDATE ON itap.organization_settings
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at_except('policy_epoch', 'policy_epoch_at', 'policy_urgent_epoch', 'policy_urgent_at');
DROP TRIGGER audit ON itap.organization_settings;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.organization_settings
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change(
    'ignore:policy_epoch', 'ignore:policy_epoch_at', 'ignore:policy_urgent_epoch', 'ignore:policy_urgent_at');

ALTER TABLE itap.devices ADD COLUMN policy_sync_error text;
DROP TRIGGER audit ON itap.devices;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.devices
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change('password', 'ignore:health_status', 'ignore:last_seen_at',
    'ignore:policy_version_synced', 'ignore:policy_synced_at', 'ignore:policy_sync_error');

-- Bumps the organization's policy epoch (and the urgent epoch when p_urgent); returns the new epoch (NULL when the
-- organization is gone, e.g. during its cascade).
CREATE FUNCTION itap.bump_policy_epoch(p_org uuid, p_urgent boolean) RETURNS bigint
LANGUAGE sql VOLATILE
SET search_path = pg_catalog, itap
AS $$
  UPDATE itap.organization_settings
  SET policy_epoch = policy_epoch + 1,
      policy_epoch_at = now(),
      policy_urgent_epoch = CASE WHEN p_urgent THEN policy_epoch + 1 ELSE policy_urgent_epoch END,
      policy_urgent_at = CASE WHEN p_urgent THEN now() ELSE policy_urgent_at END
  WHERE organization_id = p_org
  RETURNING policy_epoch;
$$;

CREATE FUNCTION itap.policy_epoch_on_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  old_effect text;
  new_effect text;
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
      SELECT effect INTO new_effect FROM itap.access_policy_versions
      WHERE organization_id = NEW.organization_id AND id = NEW.current_version_id;
      PERFORM itap.bump_policy_epoch(NEW.organization_id, new_effect IS NOT DISTINCT FROM 'deny' OR old_effect IS NOT DISTINCT FROM 'allow');
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
      PERFORM itap.bump_policy_epoch(NEW.organization_id, NEW.mode = 'lock_all');
    ELSIF TG_OP = 'UPDATE' AND NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
      PERFORM itap.bump_policy_epoch(NEW.organization_id, NEW.mode <> 'lock_all');
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER access_policies_policy_epoch AFTER UPDATE OF current_version_id OR DELETE ON itap.access_policies
  FOR EACH ROW EXECUTE FUNCTION itap.policy_epoch_on_change();
CREATE TRIGGER access_grants_policy_epoch AFTER INSERT OR UPDATE OF revoked_at OR DELETE ON itap.access_grants
  FOR EACH ROW EXECUTE FUNCTION itap.policy_epoch_on_change();
CREATE TRIGGER emergency_overrides_policy_epoch AFTER INSERT OR UPDATE OF ended_at ON itap.emergency_overrides
  FOR EACH ROW EXECUTE FUNCTION itap.policy_epoch_on_change();
