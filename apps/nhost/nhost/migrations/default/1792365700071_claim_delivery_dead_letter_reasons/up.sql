-- Final review fix 2: the claim dead-letters with a reason.
--   recipient_inactive: the recipient user is no longer an active, unexpired member at claim time (e.g. a
--     quiet-hours row released after the member left); the original scheduled time stays in deliver_after.
--   max_attempts: the delivery is out of attempts (before: error stayed NULL).
-- Everything else is unchanged (lease, scheduled_for, digest and in_app rows never claimed).
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
  IF d_row.recipient_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM itap.organization_members m
    WHERE m.organization_id = d_row.organization_id AND m.user_id = d_row.recipient_user_id
      AND m.status = 'active' AND (m.expires_at IS NULL OR m.expires_at > now())
  ) THEN
    -- Never claimed: deliver_after is still the scheduled time; after a claim it is in content.scheduled_for.
    UPDATE itap.notification_deliveries SET status = 'dead_letter', error = 'recipient_inactive',
      deliver_after = CASE WHEN attempts = 0 THEN deliver_after ELSE (content ->> 'scheduled_for')::timestamptz END
    WHERE id = d_row.id;
    RETURN;
  END IF;
  IF d_row.attempts >= itap.delivery_max_attempts() THEN
    UPDATE itap.notification_deliveries SET status = 'dead_letter', error = 'max_attempts',
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
$function$;
