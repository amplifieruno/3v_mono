DROP TABLE itap.export_jobs;
DROP FUNCTION itap.export_jobs_prepare();
DROP TABLE itap.export_definitions;
DROP FUNCTION itap.export_definitions_prepare();
DROP FUNCTION itap.member_active(uuid, uuid);
DELETE FROM itap.organization_counters WHERE entity = 'export_definition';
DROP TABLE itap.export_entities;
