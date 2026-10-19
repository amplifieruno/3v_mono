DROP TABLE itap.event_rule_version_scopes;
ALTER TABLE itap.event_rules DROP CONSTRAINT event_rules_current_version_fkey;
DROP TABLE itap.event_rule_versions;
DROP TABLE itap.event_rules;
DROP TABLE itap.event_rule_types;
