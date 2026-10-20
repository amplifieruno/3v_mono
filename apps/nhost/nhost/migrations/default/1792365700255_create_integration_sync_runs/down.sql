DROP TRIGGER audit ON itap.integrations;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.integrations
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change('secret', 'ignore:last_sync_at', 'ignore:last_error');
DROP TRIGGER integrations_schedule_reset ON itap.integrations;
DROP FUNCTION itap.integrations_schedule_reset();
DROP INDEX itap.integrations_next_sync_idx;
ALTER TABLE itap.integrations DROP CONSTRAINT integrations_fixture_file_valid;
ALTER TABLE itap.integrations DROP CONSTRAINT integrations_schedule_valid;
ALTER TABLE itap.integrations DROP COLUMN next_sync_at;
DROP TABLE itap.integration_sync_runs;
