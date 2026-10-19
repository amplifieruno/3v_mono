-- Sending (spec §8.4): claim / finish / due functions used by the backend handlers of the send_delivery and
-- send_webhook event triggers and the retry_deliveries / retry_webhooks crons. Admin secret only (not exposed to
-- roles). Attempts: at most 5; backoff after attempt n (1..4): 30 s, 2 min, 10 min, 30 min; the 5th failure is
-- dead_letter. Every claim is one conditional UPDATE, so Hasura redeliveries, concurrent handlers and the retry crons
-- never send the same attempt twice; a row that vanished (organization deleted) claims nothing.

CREATE FUNCTION itap.delivery_backoff(p_attempt integer) RETURNS interval
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_attempt
    WHEN 1 THEN interval '30 seconds'
    WHEN 2 THEN interval '2 minutes'
    WHEN 3 THEN interval '10 minutes'
    ELSE interval '30 minutes'
  END;
$$;

CREATE FUNCTION itap.delivery_max_attempts() RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT 5 $$;

-- Notification deliveries (email/sms/push/webhook channel stubs). Claim: a non in_app row that is pending or
-- retrying, due (deliver_after NULL or passed) and not a digest item (content.digest: released by the digest cron)
-- becomes 'sent' (handed to the provider) with attempts + 1. The handler then finishes it.
CREATE FUNCTION itap.claim_notification_delivery(p_delivery uuid) RETURNS SETOF itap.notification_deliveries
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

-- Result of the attempt claimed with attempts = p_attempt (a stale result changes nothing):
--   ok: stays 'sent', or 'delivered' (delivered_at) when the channel confirms delivery (p_delivered);
--   failure: 'retrying' with deliver_after = now() + backoff, or 'dead_letter' after the last attempt; error kept.
CREATE FUNCTION itap.finish_notification_delivery(
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

-- Retrying deliveries due at p_at (retry_deliveries cron), oldest first.
CREATE FUNCTION itap.due_notification_deliveries(p_at timestamptz, p_limit integer) RETURNS SETOF itap.notification_deliveries
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT * FROM itap.notification_deliveries d
  WHERE d.status = 'retrying' AND d.deliver_after <= p_at AND d.channel <> 'in_app'
  ORDER BY d.deliver_after, d.id
  LIMIT greatest(p_limit, 0);
$$;
CREATE INDEX notification_deliveries_retrying_deliver_after_idx ON itap.notification_deliveries (deliver_after)
  WHERE status = 'retrying';

-- Webhook deliveries. Claim: a pending/retrying row whose next_attempt_at is NULL or passed gets attempts + 1 and a
-- 60 s lease (next_attempt_at = now() + 60 s, longer than the 10 s request timeout), so a concurrent claim fails and
-- a crashed attempt is retried by the cron after the lease. A row of an inactive subscription is 'failed'
-- (subscription_inactive) and not returned; a row out of attempts is 'dead_letter'.
CREATE FUNCTION itap.claim_webhook_delivery(p_delivery uuid) RETURNS SETOF itap.webhook_deliveries
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  d_row itap.webhook_deliveries;
  active boolean;
BEGIN
  SELECT * INTO d_row FROM itap.webhook_deliveries d
  WHERE d.id = p_delivery AND d.status IN ('pending', 'retrying')
    AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= now())
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT s.is_active INTO active FROM itap.webhook_subscriptions s
  WHERE s.organization_id = d_row.organization_id AND s.id = d_row.subscription_id;
  IF NOT coalesce(active, false) THEN
    UPDATE itap.webhook_deliveries SET status = 'failed', error = 'subscription_inactive', next_attempt_at = NULL
    WHERE id = d_row.id;
    RETURN;
  END IF;
  IF d_row.attempts >= itap.delivery_max_attempts() THEN
    UPDATE itap.webhook_deliveries SET status = 'dead_letter', next_attempt_at = NULL WHERE id = d_row.id;
    RETURN;
  END IF;
  UPDATE itap.webhook_deliveries SET attempts = attempts + 1, next_attempt_at = now() + interval '60 seconds'
  WHERE id = d_row.id RETURNING * INTO d_row;
  RETURN NEXT d_row;
END;
$$;

-- Result of the attempt claimed with attempts = p_attempt (a stale result changes nothing). ok -> 'sent';
-- a retryable failure -> 'retrying' with next_attempt_at = now() + backoff, or 'dead_letter' after the last attempt;
-- a permanent failure (blocked address) -> 'failed'. The subscription's last_delivery_status/at follow.
CREATE FUNCTION itap.finish_webhook_delivery(
  p_delivery uuid, p_attempt integer, p_ok boolean, p_retryable boolean, p_response_code integer, p_signature text,
  p_error text
) RETURNS SETOF itap.webhook_deliveries
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  d_row itap.webhook_deliveries;
  next_status text;
BEGIN
  next_status := CASE
    WHEN p_ok THEN 'sent'
    WHEN NOT p_retryable THEN 'failed'
    WHEN p_attempt >= itap.delivery_max_attempts() THEN 'dead_letter'
    ELSE 'retrying'
  END;
  UPDATE itap.webhook_deliveries d SET
    status = next_status,
    response_code = p_response_code,
    signature = coalesce(p_signature, d.signature),
    sent_at = CASE WHEN p_ok THEN now() ELSE d.sent_at END,
    next_attempt_at = CASE WHEN next_status = 'retrying' THEN now() + itap.delivery_backoff(p_attempt) END,
    error = CASE WHEN p_ok THEN NULL ELSE left(coalesce(p_error, 'failed'), 1000) END
  WHERE d.id = p_delivery AND d.status IN ('pending', 'retrying') AND d.attempts = p_attempt
  RETURNING * INTO d_row;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  UPDATE itap.webhook_subscriptions s SET last_delivery_status = d_row.status, last_delivery_at = now()
  WHERE s.organization_id = d_row.organization_id AND s.id = d_row.subscription_id;
  RETURN NEXT d_row;
END;
$$;

-- Webhook deliveries due at p_at (retry_webhooks cron): retrying rows whose backoff passed, and rows whose first
-- attempt never happened or crashed (pending 2 minutes after creation, or past an expired lease).
CREATE FUNCTION itap.due_webhook_deliveries(p_at timestamptz, p_limit integer) RETURNS SETOF itap.webhook_deliveries
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT * FROM itap.webhook_deliveries d
  WHERE d.status IN ('pending', 'retrying')
    AND coalesce(d.next_attempt_at, d.created_at + interval '2 minutes') <= p_at
  ORDER BY coalesce(d.next_attempt_at, d.created_at + interval '2 minutes'), d.id
  LIMIT greatest(p_limit, 0);
$$;
