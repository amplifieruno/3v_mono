DROP FUNCTION itap.archive_access_policy(json, uuid);
DROP FUNCTION itap.reject_access_policy_version(json, uuid, text);
DROP FUNCTION itap.approve_access_policy_version(json, uuid);
DROP FUNCTION itap.submit_access_policy_version(json, uuid);
DROP FUNCTION itap.create_access_policy_draft(json, uuid, uuid);
DROP FUNCTION itap.lock_access_policy_version(uuid, uuid);
DROP FUNCTION itap.create_draft_version_from(regclass, regclass, text, regclass[], uuid, uuid, uuid);
