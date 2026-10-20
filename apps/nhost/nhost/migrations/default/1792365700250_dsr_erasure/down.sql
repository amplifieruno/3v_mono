DROP FUNCTION itap.dsr_erase(uuid, integer);
DROP FUNCTION itap.dsr_erase_identities(uuid, uuid[], uuid[]);
DROP FUNCTION itap.dsr_erase_leftovers(itap.data_subject_requests, itap.retention_scope, uuid[], text[], text[]);
DROP FUNCTION itap.dsr_strip_json(jsonb, text[]);
DROP FUNCTION itap.dsr_redact_text(text, text[]);
DROP FUNCTION itap.dsr_like_patterns(text[]);
DROP FUNCTION itap.dsr_terms(itap.profiles, uuid[]);
