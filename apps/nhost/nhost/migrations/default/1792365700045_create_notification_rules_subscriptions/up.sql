-- Notification rules and user subscriptions (spec §6.12).
-- A rule (code NRULE-xxxxx) matches events by type (junction), conditions (jsonb object, interpreted by Stage C)
-- and priority, and notifies a recipient group over its channels with a template, optionally escalating.
-- Group is NO ACTION (a rule never silently loses its audience); template and policy are optional extras (SET NULL).
CREATE TABLE itap.notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  number bigint NOT NULL,
  code text GENERATED ALWAYS AS ('NRULE-' || lpad(number::text, 5, '0')) STORED,
  name text NOT NULL,
  description text,
  conditions jsonb NOT NULL DEFAULT '{}',
  priority text NOT NULL DEFAULT 'medium' REFERENCES itap.notification_priorities (value),
  recipient_group_id uuid,
  template_id uuid,
  escalation_policy_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  digest_mode text NOT NULL DEFAULT 'none' REFERENCES itap.notification_digest_modes (value),
  last_triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_rules_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT notification_rules_organization_id_number_key UNIQUE (organization_id, number),
  CONSTRAINT notification_rules_organization_id_code_key UNIQUE (organization_id, code),
  CONSTRAINT notification_rules_organization_id_name_key UNIQUE (organization_id, name),
  CONSTRAINT notification_rules_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT notification_rules_conditions_object CHECK (jsonb_typeof(conditions) = 'object'),
  CONSTRAINT notification_rules_group_fkey FOREIGN KEY (organization_id, recipient_group_id)
    REFERENCES itap.recipient_groups (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT notification_rules_template_fkey FOREIGN KEY (organization_id, template_id)
    REFERENCES itap.notification_templates (organization_id, id) ON DELETE SET NULL (template_id),
  CONSTRAINT notification_rules_escalation_policy_fkey FOREIGN KEY (organization_id, escalation_policy_id)
    REFERENCES itap.escalation_policies (organization_id, id) ON DELETE SET NULL (escalation_policy_id)
);
CREATE INDEX notification_rules_organization_id_is_active_idx ON itap.notification_rules (organization_id, is_active);
CREATE INDEX notification_rules_organization_id_priority_idx ON itap.notification_rules (organization_id, priority);
CREATE INDEX notification_rules_organization_id_digest_mode_idx ON itap.notification_rules (organization_id, digest_mode);
CREATE INDEX notification_rules_organization_id_recipient_group_id_idx ON itap.notification_rules (organization_id, recipient_group_id);
CREATE INDEX notification_rules_organization_id_template_id_idx ON itap.notification_rules (organization_id, template_id);
CREATE INDEX notification_rules_organization_id_escalation_policy_id_idx ON itap.notification_rules (organization_id, escalation_policy_id);
CREATE TRIGGER notification_rules_number BEFORE INSERT ON itap.notification_rules
  FOR EACH ROW EXECUTE FUNCTION itap.assign_number('notification_rule');
CREATE TRIGGER notification_rules_set_updated_at BEFORE UPDATE ON itap.notification_rules
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.notification_rules
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change('ignore:last_triggered_at');

-- Event types a rule fires on (a rule without rows fires on none) and the channels it uses. Owned (CASCADE).
CREATE TABLE itap.notification_rule_event_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  rule_id uuid NOT NULL,
  event_type text NOT NULL REFERENCES itap.event_types (value),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_rule_event_types_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT notification_rule_event_types_organization_id_rule_id_event_type_key UNIQUE (organization_id, rule_id, event_type),
  CONSTRAINT notification_rule_event_types_rule_fkey FOREIGN KEY (organization_id, rule_id)
    REFERENCES itap.notification_rules (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX notification_rule_event_types_organization_id_event_type_idx ON itap.notification_rule_event_types (organization_id, event_type);
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.notification_rule_event_types
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

CREATE TABLE itap.notification_rule_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  rule_id uuid NOT NULL,
  channel text NOT NULL REFERENCES itap.notification_channels (value),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_rule_channels_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT notification_rule_channels_organization_id_rule_id_channel_key UNIQUE (organization_id, rule_id, channel),
  CONSTRAINT notification_rule_channels_rule_fkey FOREIGN KEY (organization_id, rule_id)
    REFERENCES itap.notification_rules (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX notification_rule_channels_organization_id_channel_idx ON itap.notification_rule_channels (organization_id, channel);
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.notification_rule_channels
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

-- Self-service subscriptions (SA_5): the owner is the session user (preset in metadata). At least one filter;
-- all set filters must match (Stage C). Filter targets are owned references: deleting the facility / identity /
-- profile / watch list removes the subscriptions on it (CASCADE). min_severity compares via itap.severity_rank.
CREATE TABLE itap.notification_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  event_type text REFERENCES itap.event_types (value),
  facility_id uuid,
  identity_id uuid,
  profile_id uuid,
  watch_list_id uuid,
  channel text NOT NULL REFERENCES itap.notification_channels (value),
  min_severity text NOT NULL DEFAULT 'info' REFERENCES itap.event_severities (value),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_subscriptions_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT notification_subscriptions_needs_filter CHECK (
    num_nonnulls(event_type, facility_id, identity_id, profile_id, watch_list_id) >= 1
  ),
  CONSTRAINT notification_subscriptions_user_fkey FOREIGN KEY (organization_id, user_id)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT notification_subscriptions_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT notification_subscriptions_identity_fkey FOREIGN KEY (organization_id, identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT notification_subscriptions_profile_fkey FOREIGN KEY (organization_id, profile_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT notification_subscriptions_watch_list_fkey FOREIGN KEY (organization_id, watch_list_id)
    REFERENCES itap.watch_lists (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX notification_subscriptions_organization_id_user_id_idx ON itap.notification_subscriptions (organization_id, user_id);
CREATE INDEX notification_subscriptions_organization_id_channel_idx ON itap.notification_subscriptions (organization_id, channel);
CREATE INDEX notification_subscriptions_organization_id_min_severity_idx ON itap.notification_subscriptions (organization_id, min_severity);
CREATE INDEX notification_subscriptions_organization_id_event_type_idx ON itap.notification_subscriptions (organization_id, event_type);
CREATE INDEX notification_subscriptions_organization_id_facility_id_idx ON itap.notification_subscriptions (organization_id, facility_id);
CREATE INDEX notification_subscriptions_organization_id_identity_id_idx ON itap.notification_subscriptions (organization_id, identity_id);
CREATE INDEX notification_subscriptions_organization_id_profile_id_idx ON itap.notification_subscriptions (organization_id, profile_id);
CREATE INDEX notification_subscriptions_organization_id_watch_list_id_idx ON itap.notification_subscriptions (organization_id, watch_list_id);
CREATE TRIGGER notification_subscriptions_active_member_check BEFORE INSERT OR UPDATE OF user_id ON itap.notification_subscriptions
  FOR EACH ROW EXECUTE FUNCTION itap.active_member_check('user_id');
CREATE TRIGGER notification_subscriptions_set_updated_at BEFORE UPDATE ON itap.notification_subscriptions
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.notification_subscriptions
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
