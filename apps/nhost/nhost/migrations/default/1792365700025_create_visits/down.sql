ALTER TABLE itap.tracking_sessions DROP CONSTRAINT tracking_sessions_visit_fkey;
DROP TABLE itap.visits;
DROP FUNCTION itap.visits_validate_transition();
DROP FUNCTION itap.visit_transition_allowed(text, text);
DROP FUNCTION itap.visits_validate_profiles();
DROP TABLE itap.visit_statuses;
DELETE FROM itap.organization_counters WHERE entity = 'visit';
