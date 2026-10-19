DROP FUNCTION itap.publish_version(regclass, regclass, text, uuid, uuid, uuid);
DROP FUNCTION itap.create_draft_version(regclass, regclass, text, regclass[], uuid, uuid);
DROP FUNCTION itap.copyable_columns(regclass, text[]);
DROP FUNCTION itap.guard_version_children();
DROP FUNCTION itap.guard_version_status();
DROP FUNCTION itap.assign_version_number();
DROP TABLE itap.version_statuses;
