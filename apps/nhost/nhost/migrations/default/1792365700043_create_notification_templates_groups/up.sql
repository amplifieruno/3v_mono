-- Notification templates and recipient groups (spec §6.12).
-- Templates: body/subject use {{variable}} placeholders (the renderer decides the variable set, slice 5 task 2);
-- one template per (name, channel, locale). is_system templates are seeded and read-only for org_admin.
CREATE TABLE itap.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  channel text NOT NULL REFERENCES itap.notification_channels (value),
  locale text NOT NULL DEFAULT 'en',
  subject text,
  body text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_templates_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT notification_templates_organization_id_name_channel_locale_key UNIQUE (organization_id, name, channel, locale),
  CONSTRAINT notification_templates_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT notification_templates_body_not_blank CHECK (btrim(body) <> ''),
  -- 'en', 'ru', 'pt-BR'
  CONSTRAINT notification_templates_locale_format CHECK (locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  CONSTRAINT notification_templates_email_subject CHECK (channel <> 'email' OR btrim(coalesce(subject, '')) <> ''),
  -- Every "{{" opens a well-formed placeholder: {{name}} / {{ recipient.name }} (lowercase, digits, _ and .).
  CONSTRAINT notification_templates_placeholders_valid CHECK (
    (coalesce(subject, '') || E'\n' || body) !~ '\{\{(?!\s*[a-z_][a-z0-9_.]*\s*\}\})'
  )
);
CREATE INDEX notification_templates_organization_id_channel_idx ON itap.notification_templates (organization_id, channel);

CREATE TRIGGER notification_templates_set_updated_at BEFORE UPDATE ON itap.notification_templates
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.notification_templates
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

CREATE TABLE itap.recipient_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipient_groups_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT recipient_groups_organization_id_name_key UNIQUE (organization_id, name),
  CONSTRAINT recipient_groups_name_not_blank CHECK (btrim(name) <> '')
);
CREATE TRIGGER recipient_groups_set_updated_at BEFORE UPDATE ON itap.recipient_groups
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.recipient_groups
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

-- A member is exactly one of an organization member (user_id; only active members can be added, deactivated
-- ones keep their row but receive nothing, spec §4.2) or an external address, with the channel to reach them.
-- External addresses: email (channel email) or E.164 phone (channel sms). Owned child of the group (CASCADE).
CREATE TABLE itap.recipient_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  group_id uuid NOT NULL,
  user_id uuid,
  external_address text,
  channel text NOT NULL REFERENCES itap.notification_channels (value),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipient_group_members_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT recipient_group_members_exactly_one_recipient CHECK (num_nonnulls(user_id, external_address) = 1),
  CONSTRAINT recipient_group_members_address_format CHECK (
    external_address IS NULL
    OR (channel = 'email' AND external_address ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
    OR (channel = 'sms' AND external_address ~ '^\+[1-9][0-9]{6,14}$')
  ),
  -- A webhook is not a person's channel; inbox and push need a user to deliver to.
  CONSTRAINT recipient_group_members_user_channel CHECK (user_id IS NULL OR channel <> 'webhook'),
  CONSTRAINT recipient_group_members_group_fkey FOREIGN KEY (organization_id, group_id)
    REFERENCES itap.recipient_groups (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT recipient_group_members_user_fkey FOREIGN KEY (organization_id, user_id)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX recipient_group_members_organization_id_group_id_idx ON itap.recipient_group_members (organization_id, group_id);
CREATE INDEX recipient_group_members_organization_id_user_id_idx ON itap.recipient_group_members (organization_id, user_id);
CREATE INDEX recipient_group_members_organization_id_channel_idx ON itap.recipient_group_members (organization_id, channel);
CREATE UNIQUE INDEX recipient_group_members_user_key ON itap.recipient_group_members (organization_id, group_id, user_id, channel)
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX recipient_group_members_address_key
  ON itap.recipient_group_members (organization_id, group_id, external_address, channel) WHERE external_address IS NOT NULL;

CREATE TRIGGER recipient_group_members_active_member_check BEFORE INSERT OR UPDATE OF user_id ON itap.recipient_group_members
  FOR EACH ROW EXECUTE FUNCTION itap.active_member_check('user_id');
CREATE TRIGGER recipient_group_members_set_updated_at BEFORE UPDATE ON itap.recipient_group_members
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.recipient_group_members
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
