DROP FUNCTION itap.set_processing_restriction(json, uuid, boolean, text);
DROP FUNCTION itap.apply_processing_restriction(uuid, uuid, boolean, text, uuid);
DROP TRIGGER identities_restricted_link ON itap.identities;
DROP FUNCTION itap.identities_restricted_link();
DROP TRIGGER profiles_restriction_guard ON itap.profiles;
DROP FUNCTION itap.profiles_restriction_guard();
DELETE FROM itap.audit_log WHERE action IN ('restrict', 'unrestrict');
DELETE FROM itap.audit_actions WHERE value IN ('restrict', 'unrestrict');
DROP INDEX itap.profiles_restricted_idx;
DROP INDEX itap.profiles_organization_id_restricted_by_idx;
ALTER TABLE itap.profiles
  DROP CONSTRAINT profiles_restricted_by_fkey,
  DROP CONSTRAINT profiles_restriction_consistent,
  DROP COLUMN restriction_reason,
  DROP COLUMN restricted_by,
  DROP COLUMN restricted_at,
  DROP COLUMN processing_restricted;
