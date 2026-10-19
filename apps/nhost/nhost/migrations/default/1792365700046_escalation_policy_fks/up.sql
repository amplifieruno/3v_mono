-- Escalation policy FKs added by slice 5 (columns exist since slice 4).
-- incidents: the policy is configuration, the incident is history -> deleting a policy detaches it (SET NULL on
-- the column only; organization_id is part of the tenant key and stays).
-- event_rule_versions: a version is an immutable record of what was enforced -> NO ACTION; a policy used by a
-- rule version cannot be deleted (create a new version pointing elsewhere, or keep the policy).
ALTER TABLE itap.incidents ADD CONSTRAINT incidents_escalation_policy_fkey
  FOREIGN KEY (organization_id, escalation_policy_id)
  REFERENCES itap.escalation_policies (organization_id, id) ON DELETE SET NULL (escalation_policy_id);
ALTER TABLE itap.event_rule_versions ADD CONSTRAINT event_rule_versions_escalation_policy_fkey
  FOREIGN KEY (organization_id, escalation_policy_id)
  REFERENCES itap.escalation_policies (organization_id, id) ON DELETE NO ACTION;
