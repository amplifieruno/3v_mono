-- Fix round 1 (task 3): notification deliveries use the webhook lease pattern, so a lost attempt is recovered.
-- Claim: status stays pending/retrying, attempts + 1, deliver_after = now() + 60 s (lease). The first claim of a row
--   deferred by quiet hours keeps the original time in content.scheduled_for. A due row already at 5 attempts is
--   dead_letter (nothing returned).
-- Finish (attempts = p_attempt, still pending/retrying): ok -> sent (email) or delivered (+ delivered_at), sent_at,
--   deliver_after back to content.scheduled_for (NULL when it was never deferred); failure -> retrying with
--   deliver_after = now() + backoff, or dead_letter after attempt 5.
-- Due (retry_deliveries cron): pending/retrying non in_app, non digest rows with coalesce(deliver_after,
--   created_at + 2 min) <= p_at: retries after backoff, expired leases (a crashed attempt), rows whose trigger never
--   fired, and quiet-hours rows whose deliver_after passed (their release; digests stay with the digest cron).
-- content may change only by adding content.scheduled_for once (guard).

CREATE OR REPLACE FUNCTION itap.guard_notification_delivery() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  mutable constant text[] := ARRAY[
    'status', 'attempts', 'deliver_after', 'sent_at', 'delivered_at', 'acknowledged_at', 'error', 'incident_id',
    'recipient_key', 'content'
  ];
BEGIN
  IF (to_jsonb(OLD) - mutable) IS DISTINCT FROM (to_jsonb(NEW) - mutable)
     OR (OLD.content - 'scheduled_for') IS DISTINCT FROM (NEW.content - 'scheduled_for')
     OR (OLD.content ? 'scheduled_for' AND OLD.content -> 'scheduled_for' IS DISTINCT FROM NEW.content -> 'scheduled_for') THEN
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
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  d_row itap.notification_deliveries;
BEGIN
  SELECT * INTO d_row FROM itap.notification_deliveries d
  WHERE d.id = p_delivery
    AND d.channel <> 'in_app'
    AND d.status IN ('pending', 'retrying')
    AND (d.deliver_after IS NULL OR d.deliver_after <= now())
    AND NOT (d.content ? 'digest')
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF d_row.attempts >= itap.delivery_max_attempts() THEN
    UPDATE itap.notification_deliveries SET status = 'dead_letter',
      deliver_after = (content ->> 'scheduled_for')::timestamptz
    WHERE id = d_row.id;
    RETURN;
  END IF;
  UPDATE itap.notification_deliveries SET
    attempts = attempts + 1,
    deliver_after = now() + interval '60 seconds',
    content = CASE
      WHEN deliver_after IS NOT NULL AND attempts = 0 AND status = 'pending' AND NOT (content ? 'scheduled_for')
        THEN content || jsonb_build_object('scheduled_for', deliver_after)
      ELSE content
    END
  WHERE id = d_row.id
  RETURNING * INTO d_row;
  RETURN NEXT d_row;
END;
$$;

CREATE OR REPLACE FUNCTION itap.finish_notification_delivery(
  p_delivery uuid, p_attempt integer, p_ok boolean, p_delivered boolean, p_error text
) RETURNS SETOF itap.notification_deliveries
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  d_row itap.notification_deliveries;
  next_status text;
BEGIN
  next_status := CASE
    WHEN p_ok AND p_delivered THEN 'delivered'
    WHEN p_ok THEN 'sent'
    WHEN p_attempt >= itap.delivery_max_attempts() THEN 'dead_letter'
    ELSE 'retrying'
  END;
  UPDATE itap.notification_deliveries d SET
    status = next_status,
    sent_at = CASE WHEN p_ok THEN now() ELSE d.sent_at END,
    delivered_at = CASE WHEN next_status = 'delivered' THEN now() ELSE d.delivered_at END,
    deliver_after = CASE
      WHEN next_status = 'retrying' THEN now() + itap.delivery_backoff(p_attempt)
      ELSE (d.content ->> 'scheduled_for')::timestamptz
    END,
    error = CASE WHEN p_ok THEN NULL ELSE left(coalesce(p_error, 'failed'), 1000) END
  WHERE d.id = p_delivery AND d.status IN ('pending', 'retrying') AND d.attempts = p_attempt
  RETURNING * INTO d_row;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  RETURN NEXT d_row;
END;
$$;

CREATE OR REPLACE FUNCTION itap.due_notification_deliveries(p_at timestamptz, p_limit integer)
RETURNS SETOF itap.notification_deliveries
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT * FROM itap.notification_deliveries d
  WHERE d.status IN ('pending', 'retrying') AND d.channel <> 'in_app' AND NOT (d.content ? 'digest')
    AND coalesce(d.deliver_after, d.created_at + interval '2 minutes') <= p_at
  ORDER BY coalesce(d.deliver_after, d.created_at + interval '2 minutes'), d.id
  LIMIT greatest(p_limit, 0);
$$;

DROP INDEX itap.notification_deliveries_retrying_deliver_after_idx;
CREATE INDEX notification_deliveries_due_idx ON itap.notification_deliveries (deliver_after, created_at)
  WHERE status IN ('pending', 'retrying') AND channel <> 'in_app';
