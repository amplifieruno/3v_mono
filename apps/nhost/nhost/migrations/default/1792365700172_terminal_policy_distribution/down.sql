DROP FUNCTION itap.terminal_sync_status(json);
DROP TABLE itap_results.terminal_sync_status_rows;
DROP FUNCTION itap.record_terminal_sync(uuid, bigint, boolean, boolean, text, text, integer, numeric, text);
DROP FUNCTION itap.terminals_due_for_sync(timestamptz, boolean, uuid, uuid);
DROP TABLE itap_results.terminal_sync_targets;
DROP FUNCTION itap.terminal_policy_payload(uuid);
DROP TABLE itap_results.terminal_policy_payloads;
DROP FUNCTION itap.policy_terminals(uuid);

DROP TRIGGER devices_set_updated_at ON itap.devices;
CREATE TRIGGER devices_set_updated_at BEFORE UPDATE ON itap.devices
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();

DROP TABLE itap.terminal_policy_syncs;
DROP TABLE itap.terminal_sync_results;
