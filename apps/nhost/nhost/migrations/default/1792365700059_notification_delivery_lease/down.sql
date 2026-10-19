-- Restores the task-3 claim-as-sent functions and the task-2 guard.
DROP INDEX itap.notification_deliveries_due_idx;
CREATE INDEX notification_deliveries_retrying_deliver_after_idx ON itap.notification_deliveries (deliver_after)
  WHERE status = 'retrying';

CREATE OR REPLACE FUNCTION itap.guard_notification_delivery() RETURNS trigger
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

CREATE OR REPLACE FUNCTION itap.claim_notification_delivery(p_delivery uuid) RETURNS SETOF itap.notification_deliveries
LANGUAGE sql VOLATILE
SET search_path = pg_catalog, itap
AS $$
  UPDATE itap.notification_deliveries d
  SET status = 'sent', attempts = d.attempts + 1, sent_at = now(), error = NULL
  WHERE d.id = p_delivery
    AND d.channel <> 'in_app'
    AND d.status IN ('pending', 'retrying')
    AND (d.deliver_after IS NULL OR d.deliver_after <= now())
    AND NOT (d.content ? 'digest')
    AND d.attempts < itap.delivery_max_attempts()
  RETURNING d.*;
$$;

CREATE OR REPLACE FUNCTION itap.finish_notification_delivery(
  p_delivery uuid, p_attempt integer, p_ok boolean, p_delivered boolean, p_error text
) RETURNS SETOF itap.notification_deliveries
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  d_row itap.notification_deliveries;
BEGIN
  SELECT * INTO d_row FROM itap.notification_deliveries
  WHERE id = p_delivery AND status = 'sent' AND attempts = p_attempt
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF p_ok THEN
    IF p_delivered THEN
      UPDATE itap.notification_deliveries SET status = 'delivered', delivered_at = now()
      WHERE id = p_delivery RETURNING * INTO d_row;
    END IF;
  ELSE
    UPDATE itap.notification_deliveries SET status = 'failed', error = left(coalesce(p_error, 'failed'), 1000)
    WHERE id = p_delivery;
    IF p_attempt >= itap.delivery_max_attempts() THEN
      UPDATE itap.notification_deliveries SET status = 'dead_letter'
      WHERE id = p_delivery RETURNING * INTO d_row;
    ELSE
      UPDATE itap.notification_deliveries SET status = 'retrying', deliver_after = now() + itap.delivery_backoff(p_attempt)
      WHERE id = p_delivery RETURNING * INTO d_row;
    END IF;
  END IF;
  RETURN NEXT d_row;
END;
$$;

CREATE OR REPLACE FUNCTION itap.due_notification_deliveries(p_at timestamptz, p_limit integer) RETURNS SETOF itap.notification_deliveries
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT * FROM itap.notification_deliveries d
  WHERE d.status = 'retrying' AND d.deliver_after <= p_at AND d.channel <> 'in_app'
  ORDER BY d.deliver_after, d.id
  LIMIT greatest(p_limit, 0);
$$;

