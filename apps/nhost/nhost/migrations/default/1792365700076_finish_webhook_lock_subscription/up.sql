-- Final review fix 7: finish_webhook_delivery locks the subscription row before the delivery row (it updates both).
-- One order for the two row locks, parent first (subscription -> delivery), so concurrent finishes of deliveries of
-- one subscription queue on the subscription instead of holding a delivery while waiting for it. The claim locks only
-- the delivery (it reads is_active without a lock). Results are unchanged.
CREATE OR REPLACE FUNCTION itap.finish_webhook_delivery(p_delivery uuid, p_attempt integer, p_ok boolean, p_retryable boolean, p_response_code integer, p_signature text, p_error text)
 RETURNS SETOF itap.webhook_deliveries
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  d_row itap.webhook_deliveries;
  next_status text;
BEGIN
  -- The subscription first (organization_id and subscription_id of a delivery never change).
  PERFORM 1 FROM itap.webhook_subscriptions s
  JOIN itap.webhook_deliveries d ON d.organization_id = s.organization_id AND d.subscription_id = s.id
  WHERE d.id = p_delivery
  FOR NO KEY UPDATE OF s;
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
$function$;
