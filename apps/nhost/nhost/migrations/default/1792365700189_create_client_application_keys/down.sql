DROP FUNCTION itap.revoke_client_key(json, uuid);
DROP FUNCTION itap.store_client_key(json, uuid, text, text, timestamptz);
DROP TABLE itap.client_application_keys;
DROP FUNCTION itap.guard_client_application_key();
