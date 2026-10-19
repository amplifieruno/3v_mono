DROP TABLE itap.access_policy_version_targets;
DROP TABLE itap.access_policy_version_subjects;
ALTER TABLE itap.access_policies DROP CONSTRAINT access_policies_current_version_fkey;
DROP TABLE itap.access_policy_versions;
DROP TABLE itap.access_policies;
DROP FUNCTION itap.guard_access_policy_children();
DROP FUNCTION itap.guard_access_policy_version();
DELETE FROM itap.organization_counters WHERE entity = 'access_policy';
ALTER TABLE itap.access_points DROP CONSTRAINT access_points_organization_id_id_key;
