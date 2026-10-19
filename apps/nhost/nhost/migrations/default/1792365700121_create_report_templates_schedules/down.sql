DROP TABLE itap.report_schedules;
DROP FUNCTION itap.report_schedules_prepare();
DROP TABLE itap.report_templates;
DROP FUNCTION itap.report_period(text, text, timestamptz);
DROP FUNCTION itap.valid_report_parameters(jsonb);
DROP FUNCTION itap.valid_cron(text);
