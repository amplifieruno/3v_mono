DROP TABLE itap.bulk_job_rows;
DROP TABLE itap.bulk_jobs;
DROP FUNCTION itap.bulk_jobs_guard();
DROP FUNCTION itap.bulk_job_transition_allowed(text, text);
DROP FUNCTION itap.valid_bulk_job_options(text, jsonb);
DELETE FROM itap.organization_counters WHERE entity = 'bulk_job';
