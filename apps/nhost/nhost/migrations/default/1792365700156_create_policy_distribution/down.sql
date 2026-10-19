DROP TRIGGER emergency_overrides_policy_epoch ON itap.emergency_overrides;
DROP TRIGGER access_grants_policy_epoch ON itap.access_grants;
DROP TRIGGER access_policies_policy_epoch ON itap.access_policies;
DROP FUNCTION itap.policy_epoch_on_change();
DROP FUNCTION itap.bump_policy_epoch(uuid, boolean);

DROP TRIGGER audit ON itap.devices;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.devices
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change('password', 'ignore:health_status', 'ignore:last_seen_at',
    'ignore:policy_version_synced', 'ignore:policy_synced_at');
ALTER TABLE itap.devices DROP COLUMN policy_sync_error;

DROP TRIGGER audit ON itap.organization_settings;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.organization_settings
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
DROP TRIGGER organization_settings_set_updated_at ON itap.organization_settings;
CREATE TRIGGER organization_settings_set_updated_at BEFORE UPDATE ON itap.organization_settings
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
ALTER TABLE itap.organization_settings
  DROP CONSTRAINT organization_settings_policy_revocation_bound_range,
  DROP CONSTRAINT organization_settings_policy_epoch_consistent,
  DROP COLUMN policy_revocation_bound_seconds,
  DROP COLUMN policy_urgent_at,
  DROP COLUMN policy_urgent_epoch,
  DROP COLUMN policy_epoch_at,
  DROP COLUMN policy_epoch;
