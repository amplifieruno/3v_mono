DROP FUNCTION IF EXISTS itap.effective_identity(uuid, uuid);
DROP TYPE IF EXISTS itap.access_evaluation;
DROP INDEX IF EXISTS itap.access_grants_open_profile_idx;
DROP INDEX IF EXISTS itap.access_decisions_denied_identity_idx;
DROP INDEX IF EXISTS itap.access_decisions_denied_profile_idx;
DROP INDEX IF EXISTS itap.segment_members_organization_id_segment_id_identity_id_idx;
DROP INDEX IF EXISTS itap.segment_members_organization_id_segment_id_profile_id_idx;
