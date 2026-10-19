-- notification_deliveries.report_id (slice 5 left the column): composite FK to reports, SET NULL (report_id) so a
-- report removed by retention keeps its delivery log. The exactly-one-origin CHECK accepts that orphan only for
-- report deliveries (content.report_code is always written with report_id), and the delivery guard lets the FK
-- null the column. The per-origin unique index (report_id, recipient_key, channel) exists since slice 5; the FK
-- needs a plain covering index (the partial one does not count).
ALTER TABLE itap.notification_deliveries DROP CONSTRAINT notification_deliveries_exactly_one_origin;
ALTER TABLE itap.notification_deliveries ADD CONSTRAINT notification_deliveries_exactly_one_origin CHECK (
  num_nonnulls(rule_id, escalation_step_id, subscription_id, report_id) = 1
  OR (num_nonnulls(rule_id, escalation_step_id, subscription_id, report_id) = 0 AND content ? 'report_code'));

DROP INDEX itap.notification_deliveries_organization_id_report_id_idx;
CREATE INDEX notification_deliveries_organization_id_report_id_idx
  ON itap.notification_deliveries (organization_id, report_id);
ALTER TABLE itap.notification_deliveries ADD CONSTRAINT notification_deliveries_report_fkey
  FOREIGN KEY (organization_id, report_id) REFERENCES itap.reports (organization_id, id) ON DELETE SET NULL (report_id);

CREATE OR REPLACE FUNCTION itap.guard_notification_delivery() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  mutable text[] := ARRAY[
    'status', 'attempts', 'deliver_after', 'sent_at', 'delivered_at', 'acknowledged_at', 'error', 'incident_id',
    'recipient_key', 'content', 'digested_into'
  ];
BEGIN
  IF itap.seed_context() THEN
    mutable := mutable || 'created_at'::text;
  END IF;
  -- The report FK may only null the column (SET NULL on report deletion).
  IF NEW.report_id IS NULL AND OLD.report_id IS NOT NULL THEN
    mutable := mutable || 'report_id'::text;
  END IF;
  IF (to_jsonb(OLD) - mutable) IS DISTINCT FROM (to_jsonb(NEW) - mutable)
     OR (OLD.content - 'scheduled_for') IS DISTINCT FROM (NEW.content - 'scheduled_for')
     OR (OLD.content ? 'scheduled_for' AND OLD.content -> 'scheduled_for' IS DISTINCT FROM NEW.content -> 'scheduled_for')
     OR (OLD.digested_into IS NOT NULL AND NEW.digested_into IS DISTINCT FROM OLD.digested_into) THEN
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
