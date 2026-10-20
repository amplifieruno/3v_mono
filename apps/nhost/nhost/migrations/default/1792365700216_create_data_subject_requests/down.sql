DROP TABLE itap.dsr_steps;
DROP FUNCTION itap.dsr_steps_append_only();
DROP TABLE itap.data_subject_requests;
DROP FUNCTION itap.data_subject_requests_guard();
DROP FUNCTION itap.dsr_transition_allowed(text, text);
DROP FUNCTION itap.check_file_kind();
DELETE FROM itap.organization_counters WHERE entity = 'data_subject_request';
