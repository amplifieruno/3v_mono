-- Order: the Hasura metadata references both functions (computed fields event_rule_versions.rule_type and
-- incidents.rule_id). Before migrating down, remove them from apps/nhost/metadata-src/events.ts and incidents.ts,
-- run `pnpm --filter nhost metadata:generate` and apply the metadata; otherwise the metadata turns inconsistent.
DROP FUNCTION itap.incident_rule_id(itap.incidents);
DROP FUNCTION itap.event_rule_version_rule_type(itap.event_rule_versions);
