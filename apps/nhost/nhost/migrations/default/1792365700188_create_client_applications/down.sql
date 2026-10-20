DROP TABLE itap.client_application_access_points;
DROP TABLE itap.client_application_facilities;
DROP TABLE itap.client_application_segments;
DROP TABLE itap.client_application_attributes;
DROP TABLE itap.client_application_modes;
DROP FUNCTION itap.sandbox_population_check();
DROP TABLE itap.client_applications;
DROP FUNCTION itap.guard_client_application();
DELETE FROM itap.organization_counters WHERE entity = 'client_application';
