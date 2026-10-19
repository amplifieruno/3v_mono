-- Restore the slice-5 delivery guard, origin CHECK and partial index.
CREATE OR REPLACE FUNCTION itap.guard_notification_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  mutable text[] := ARRAY[
    'status', 'attempts', 'deliver_after', 'sent_at', 'delivered_at', 'acknowledged_at', 'error', 'incident_id',
    'recipient_key', 'content', 'digested_into'
  ];
BEGIN
  IF itap.seed_context() THEN
    mutable := mutable || 'created_at'::text;
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
$function$

;
ALTER TABLE itap.notification_deliveries DROP CONSTRAINT notification_deliveries_report_fkey;
DROP INDEX itap.notification_deliveries_organization_id_report_id_idx;
CREATE INDEX notification_deliveries_organization_id_report_id_idx ON itap.notification_deliveries (organization_id, report_id)
  WHERE report_id IS NOT NULL;
DELETE FROM itap.notification_deliveries
  WHERE num_nonnulls(rule_id, escalation_step_id, subscription_id, report_id) = 0;
ALTER TABLE itap.notification_deliveries DROP CONSTRAINT notification_deliveries_exactly_one_origin;
ALTER TABLE itap.notification_deliveries ADD CONSTRAINT notification_deliveries_exactly_one_origin
  CHECK (num_nonnulls(rule_id, escalation_step_id, subscription_id, report_id) = 1);
