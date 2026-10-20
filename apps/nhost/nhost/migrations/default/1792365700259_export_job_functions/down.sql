DROP FUNCTION itap.record_export_definition_failure(uuid, timestamptz, timestamptz, text);
DROP FUNCTION itap.run_export_definition(uuid, timestamptz, timestamptz);
DROP FUNCTION itap.init_export_definition(uuid, timestamptz);
DROP FUNCTION itap.due_export_jobs(timestamptz, integer);
DROP FUNCTION itap.fail_export_job(uuid, integer, text);
DROP FUNCTION itap.complete_export_job(uuid, integer, uuid, integer, boolean, timestamptz);
DROP FUNCTION itap.claim_export_job(uuid);
DROP FUNCTION itap.export_max_attempts();
