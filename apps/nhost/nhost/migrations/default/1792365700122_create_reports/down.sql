DROP TABLE itap.report_metrics;
DROP TABLE itap.report_segments;
DROP TABLE itap.report_facilities;
DROP TABLE itap.reports;
DROP FUNCTION itap.reports_guard();
DROP FUNCTION itap.report_transition_allowed(text, text);
DELETE FROM itap.organization_counters WHERE entity = 'report';
