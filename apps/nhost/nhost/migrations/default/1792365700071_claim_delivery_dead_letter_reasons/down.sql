-- Restores claim_notification_delivery as of 1792365700059 (dead letter without an error).
CREATE OR REPLACE FUNCTION itap.claim_notification_delivery(p_delivery uuid)
 RETURNS SETOF itap.notification_deliveries
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
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
$function$

;
