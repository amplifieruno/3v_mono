CREATE TABLE itap.audit_actions (
  value text PRIMARY KEY,
  description text
);

INSERT INTO itap.audit_actions (value, description) VALUES
  ('insert', 'Row created'),
  ('update', 'Row changed'),
  ('delete', 'Row removed'),
  ('switch_org', 'User switched the active organization'),
  ('export', 'Data exported'),
  ('view_sensitive', 'Sensitive data viewed'),
  ('merge', 'Records merged'),
  ('rollback', 'Change rolled back'),
  ('approve', 'Request approved'),
  ('reject', 'Request rejected'),
  ('publish', 'Item published');

-- organization_id has no FK on purpose: audit rows must outlive the organization.
CREATE TABLE itap.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid,
  action text NOT NULL REFERENCES itap.audit_actions (value),
  entity text,
  entity_id uuid,
  changes jsonb,
  reason text,
  ip inet,
  user_agent text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_organization_id_occurred_at_idx ON itap.audit_log (organization_id, occurred_at DESC);
CREATE INDEX audit_log_organization_id_entity_entity_id_idx ON itap.audit_log (organization_id, entity, entity_id);
