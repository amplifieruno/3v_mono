DROP FUNCTION itap.escalate_incident(json, uuid, text);
DROP FUNCTION itap.close_incident(json, uuid);
DROP FUNCTION itap.resolve_incident(json, uuid, text, text);
DROP FUNCTION itap.start_investigation(json, uuid);
DROP FUNCTION itap.acknowledge_incident(json, uuid);
DROP FUNCTION itap.lock_incident(uuid, uuid);
