DROP TRIGGER integrations_status_guard ON itap.integrations;
DROP FUNCTION itap.integrations_status_guard();
ALTER TABLE itap.integrations DROP CONSTRAINT integrations_secret_encrypted;
