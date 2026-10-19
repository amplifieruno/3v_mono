-- Restores the guards and the inbox stamp without the seed flag; drops the seed-only functions.
DROP FUNCTION itap.seed_finalize_notifications(uuid, timestamptz);
DROP FUNCTION itap.seed_escalate_incident(uuid, timestamptz, uuid);

CREATE OR REPLACE FUNCTION itap.guard_notification_delivery() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  mutable constant text[] := ARRAY[
    'status', 'attempts', 'deliver_after', 'sent_at', 'delivered_at', 'acknowledged_at', 'error', 'incident_id',
    'recipient_key', 'content', 'digested_into'
  ];
BEGIN
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

CREATE OR REPLACE FUNCTION itap.guard_webhook_delivery() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  mutable constant text[] := ARRAY['status', 'attempts', 'response_code', 'signature', 'sent_at', 'next_attempt_at', 'error'];
BEGIN
  IF (to_jsonb(OLD) - mutable) IS DISTINCT FROM (to_jsonb(NEW) - mutable) THEN
    PERFORM itap.raise_code('webhook_delivery_immutable');
  END IF;
  IF NOT itap.webhook_delivery_transition_allowed(OLD.status, NEW.status) THEN
    PERFORM itap.raise_code('webhook_delivery_invalid_transition');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION itap.user_notifications_stamp() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF OLD.acknowledged_at IS NOT NULL THEN
    NEW.acknowledged_at := OLD.acknowledged_at;
  ELSIF NEW.acknowledged_at IS NOT NULL THEN
    NEW.acknowledged_at := now();
  END IF;
  IF NEW.read_at IS NOT NULL AND OLD.read_at IS NOT NULL THEN
    NEW.read_at := OLD.read_at;
  ELSIF NEW.read_at IS NOT NULL THEN
    NEW.read_at := now();
  END IF;
  IF NEW.acknowledged_at IS NOT NULL AND NEW.read_at IS NULL THEN
    NEW.read_at := NEW.acknowledged_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION itap.seed_context();
