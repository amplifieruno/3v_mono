-- System-created incidents (Stage B / dwell cron, rule versions with creates_incident) are deduplicated per
-- session and rule: dedup_key `session:<session_id>:rule:<rule_id>` (`event:<event_id>:rule:<rule_id>` for an event
-- without a session). Writers use INSERT ... ON CONFLICT (organization_id, dedup_key) DO NOTHING, so a redelivered
-- Stage B event creates no second incident. NULL for manually created incidents (read-only in metadata).
ALTER TABLE itap.incidents ADD COLUMN dedup_key text;
ALTER TABLE itap.incidents ADD CONSTRAINT incidents_organization_id_dedup_key_key UNIQUE (organization_id, dedup_key);
