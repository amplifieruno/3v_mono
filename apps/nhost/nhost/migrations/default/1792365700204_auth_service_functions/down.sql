DROP FUNCTION itap.expire_auth_sessions(uuid, timestamptz);
DROP FUNCTION itap.auth_session_state(uuid, uuid, uuid);
DROP FUNCTION itap.auth_second_factor(uuid, uuid, uuid, boolean, text);
DROP FUNCTION itap.auth_service_decide(uuid, uuid, uuid, text, uuid, uuid, text, jsonb, jsonb, numeric, uuid);
DROP FUNCTION itap.auth_open_session(uuid, uuid, uuid, uuid, text, uuid, text, uuid, text, text, text, text);
DROP FUNCTION itap.auth_public_decision(uuid, uuid, itap.auth_decision, uuid);
DROP FUNCTION itap.auth_public_failure_reason(text);
DROP TABLE itap_results.auth_session_states;
DROP TABLE itap_results.auth_decisions;
