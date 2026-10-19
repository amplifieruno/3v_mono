DROP FUNCTION itap.report_attendance(itap.report_context);
DROP FUNCTION itap.report_behavior(itap.report_context);
DROP FUNCTION itap.report_heatmap(itap.report_context);
DROP FUNCTION itap.report_occupancy(itap.report_context);
DROP FUNCTION itap.report_flow(itap.report_context);
DROP FUNCTION itap.report_time(timestamptz, text);
DROP FUNCTION itap.report_metric(text, text, numeric, text, text, jsonb);
DROP TYPE itap.report_context;
