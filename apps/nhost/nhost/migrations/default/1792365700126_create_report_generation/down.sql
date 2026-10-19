DROP FUNCTION itap.generate_incident_report(json, uuid, text);
DROP FUNCTION itap.retry_report(json, uuid);
DROP FUNCTION itap.due_reports(timestamptz, integer);
DROP FUNCTION itap.fail_report(uuid, integer, text);
DROP FUNCTION itap.compute_report(uuid, integer);
DROP FUNCTION itap.claim_report(uuid);
DROP FUNCTION itap.report_max_attempts();
DROP TABLE itap_results.report_datasets;
