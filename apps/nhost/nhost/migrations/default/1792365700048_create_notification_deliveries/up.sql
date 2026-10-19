-- Notification deliveries (spec §6.12): one row per (origin, recipient, channel) message. Written only by trusted SQL
-- (Stage C fan-out, escalation, digests, reports) and updated by the sending handlers (slice 5 tasks 3-4);
-- read-only for org_admin, not audited (high volume).
-- Origin: exactly one of rule / escalation step (+ escalation_cycle) / subscription / report (report FK: slice 7).
-- Recipient: exactly one of an organization member (recipient_user_id) or an external address (group member).
-- Idempotency: one partial unique index per origin (recipient_key folds the two recipient columns into one text):
--   rule:         (rule_id, event_id, recipient, channel)
--   escalation:   (escalation_step_id, incident_id, escalation_cycle, recipient)
--   subscription: (subscription_id, event_id)
--   report:       (report_id, recipient, channel)
-- so writers INSERT ... ON CONFLICT DO NOTHING and a redelivered event or cron run writes nothing twice.
-- References: event_id is a plain log link (spec §4.1); incident is stable history -> SET NULL (incident_id);
-- rule and escalation step are configuration in use -> NO ACTION (deactivate a rule, keep the step); a subscription
-- is the owner's self-service setting -> its deliveries go with it (CASCADE; the inbox rows stay).
-- deliver_after: not before this instant (quiet hours, digests); NULL = at once.
CREATE TABLE itap.notification_delivery_statuses (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.notification_delivery_statuses (value, description) VALUES
  ('pending', 'Waiting to be sent (possibly deferred until deliver_after)'),
  ('sent', 'Handed to the channel provider'),
  ('delivered', 'Delivered to the recipient'),
  ('failed', 'Attempt failed'),
  ('retrying', 'Scheduled for another attempt'),
  ('dead_letter', 'Given up after the last attempt');

CREATE TABLE itap.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  rule_id uuid,
  escalation_step_id uuid,
  escalation_cycle integer,
  subscription_id uuid,
  report_id uuid,
  event_id uuid,
  incident_id uuid,
  recipient_user_id uuid,
  recipient_address text,
  recipient_key text GENERATED ALWAYS AS (coalesce('user:' || recipient_user_id::text, 'address:' || recipient_address)) STORED,
  channel text NOT NULL REFERENCES itap.notification_channels (value),
  priority text NOT NULL DEFAULT 'medium' REFERENCES itap.notification_priorities (value),
  status text NOT NULL DEFAULT 'pending' REFERENCES itap.notification_delivery_statuses (value),
  attempts integer NOT NULL DEFAULT 0,
  deliver_after timestamptz,
  content jsonb NOT NULL DEFAULT '{}',
  sent_at timestamptz,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_deliveries_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT notification_deliveries_exactly_one_origin
    CHECK (num_nonnulls(rule_id, escalation_step_id, subscription_id, report_id) = 1),
  CONSTRAINT notification_deliveries_exactly_one_recipient CHECK (num_nonnulls(recipient_user_id, recipient_address) = 1),
  CONSTRAINT notification_deliveries_escalation_cycle
    CHECK ((escalation_step_id IS NULL) = (escalation_cycle IS NULL) AND (escalation_cycle IS NULL OR escalation_cycle >= 0)),
  CONSTRAINT notification_deliveries_attempts_nonnegative CHECK (attempts >= 0),
  CONSTRAINT notification_deliveries_content_object CHECK (jsonb_typeof(content) = 'object'),
  CONSTRAINT notification_deliveries_rule_fkey FOREIGN KEY (organization_id, rule_id)
    REFERENCES itap.notification_rules (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT notification_deliveries_escalation_step_fkey FOREIGN KEY (organization_id, escalation_step_id)
    REFERENCES itap.escalation_policy_steps (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT notification_deliveries_subscription_fkey FOREIGN KEY (organization_id, subscription_id)
    REFERENCES itap.notification_subscriptions (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT notification_deliveries_incident_fkey FOREIGN KEY (organization_id, incident_id)
    REFERENCES itap.incidents (organization_id, id) ON DELETE SET NULL (incident_id),
  CONSTRAINT notification_deliveries_recipient_user_fkey FOREIGN KEY (organization_id, recipient_user_id)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);

CREATE UNIQUE INDEX notification_deliveries_rule_key
  ON itap.notification_deliveries (organization_id, rule_id, event_id, recipient_key, channel) WHERE rule_id IS NOT NULL;
CREATE UNIQUE INDEX notification_deliveries_escalation_key
  ON itap.notification_deliveries (organization_id, escalation_step_id, incident_id, escalation_cycle, recipient_key)
  WHERE escalation_step_id IS NOT NULL;
CREATE UNIQUE INDEX notification_deliveries_subscription_key
  ON itap.notification_deliveries (organization_id, subscription_id, event_id) WHERE subscription_id IS NOT NULL;
CREATE UNIQUE INDEX notification_deliveries_report_key
  ON itap.notification_deliveries (organization_id, report_id, recipient_key, channel) WHERE report_id IS NOT NULL;

-- FK-covering indexes (the partial unique indexes do not count: they skip rows).
CREATE INDEX notification_deliveries_organization_id_rule_id_idx ON itap.notification_deliveries (organization_id, rule_id);
CREATE INDEX notification_deliveries_organization_id_escalation_step_id_idx ON itap.notification_deliveries (organization_id, escalation_step_id);
CREATE INDEX notification_deliveries_organization_id_subscription_id_idx ON itap.notification_deliveries (organization_id, subscription_id);
CREATE INDEX notification_deliveries_organization_id_incident_id_idx ON itap.notification_deliveries (organization_id, incident_id);
CREATE INDEX notification_deliveries_organization_id_recipient_user_id_idx ON itap.notification_deliveries (organization_id, recipient_user_id);
CREATE INDEX notification_deliveries_organization_id_event_id_idx ON itap.notification_deliveries (organization_id, event_id);
CREATE INDEX notification_deliveries_organization_id_report_id_idx ON itap.notification_deliveries (organization_id, report_id)
  WHERE report_id IS NOT NULL;
CREATE INDEX notification_deliveries_organization_id_channel_idx ON itap.notification_deliveries (organization_id, channel);
CREATE INDEX notification_deliveries_organization_id_priority_idx ON itap.notification_deliveries (organization_id, priority);
CREATE INDEX notification_deliveries_organization_id_status_idx ON itap.notification_deliveries (organization_id, status);
CREATE INDEX notification_deliveries_organization_id_created_at_idx ON itap.notification_deliveries (organization_id, created_at DESC);
-- Deferred work (release of quiet-hours / digest deliveries, slice 5 task 4).
CREATE INDEX notification_deliveries_pending_deliver_after_idx ON itap.notification_deliveries (deliver_after)
  WHERE status = 'pending' AND deliver_after IS NOT NULL;

-- Allowed status changes (same status = another attempt / bookkeeping):
--   pending  -> sent | delivered | failed | retrying | dead_letter
--   retrying -> sent | delivered | failed | retrying | dead_letter
--   failed   -> retrying | dead_letter
--   sent     -> delivered | failed
--   delivered, dead_letter: terminal
CREATE FUNCTION itap.notification_delivery_transition_allowed(p_from text, p_to text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT p_from = p_to OR CASE p_from
    WHEN 'pending' THEN p_to IN ('sent', 'delivered', 'failed', 'retrying', 'dead_letter')
    WHEN 'retrying' THEN p_to IN ('sent', 'delivered', 'failed', 'dead_letter')
    WHEN 'failed' THEN p_to IN ('retrying', 'dead_letter')
    WHEN 'sent' THEN p_to IN ('delivered', 'failed')
    ELSE false
  END;
$$;

-- A delivery is a log row: only its sending state changes (status per the transitions above, attempts, timing,
-- error); acknowledged_at is set once. incident_id may be nulled by its FK (SET NULL). recipient_key is generated
-- (NULL in NEW of a BEFORE trigger) and follows the immutable recipient columns.
CREATE FUNCTION itap.guard_notification_delivery() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  mutable constant text[] := ARRAY[
    'status', 'attempts', 'deliver_after', 'sent_at', 'delivered_at', 'acknowledged_at', 'error', 'incident_id',
    'recipient_key'
  ];
BEGIN
  IF (to_jsonb(OLD) - mutable) IS DISTINCT FROM (to_jsonb(NEW) - mutable) THEN
    PERFORM itap.raise_code('notification_delivery_immutable');
  END IF;
  IF NOT itap.notification_delivery_transition_allowed(OLD.status, NEW.status) THEN
    PERFORM itap.raise_code('notification_delivery_invalid_transition');
  END IF;
  IF OLD.acknowledged_at IS NOT NULL AND NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at THEN
    PERFORM itap.raise_code('notification_delivery_already_acknowledged');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notification_deliveries_guard BEFORE UPDATE ON itap.notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION itap.guard_notification_delivery();
