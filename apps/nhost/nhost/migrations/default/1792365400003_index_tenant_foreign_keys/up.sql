-- Every FK column set is indexed, leading with organization_id (design §4.1); enforced by metadata:generate.
CREATE INDEX organization_invitations_status_idx ON itap.organization_invitations (organization_id, status);
CREATE INDEX organization_invitations_role_idx ON itap.organization_invitations (organization_id, role);
DROP INDEX itap.organization_invitations_accepted_by_idx;
CREATE INDEX organization_invitations_accepted_by_idx ON itap.organization_invitations (organization_id, accepted_by);
CREATE INDEX audit_log_organization_id_action_idx ON itap.audit_log (organization_id, action);
