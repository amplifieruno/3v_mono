ALTER TABLE itap.profiles DROP CONSTRAINT profiles_source_integration_fkey;
DROP INDEX itap.profiles_source_integration_external_key;
DROP TABLE itap.integrations;
DELETE FROM itap.organization_counters WHERE entity = 'integration';
