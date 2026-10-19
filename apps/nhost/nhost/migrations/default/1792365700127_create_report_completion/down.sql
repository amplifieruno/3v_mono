DROP FUNCTION itap.run_report_schedule(uuid, timestamptz, timestamptz);
DROP FUNCTION itap.init_report_schedule(uuid, timestamptz);
DROP FUNCTION itap.complete_report(uuid, integer, uuid, jsonb);
DROP FUNCTION itap.report_delivery_content(itap.reports);
