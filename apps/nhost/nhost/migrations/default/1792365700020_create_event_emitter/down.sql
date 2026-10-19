DROP FUNCTION itap.bump_rule_counters(uuid, uuid[]);
DROP FUNCTION itap.emit_event(itap.events, uuid);
DROP FUNCTION itap.link_rule_incident(itap.events, uuid, text, uuid);
DROP FUNCTION itap.matching_rule_versions(uuid, text, uuid, uuid);
DROP FUNCTION itap.event_rule_type(text);
