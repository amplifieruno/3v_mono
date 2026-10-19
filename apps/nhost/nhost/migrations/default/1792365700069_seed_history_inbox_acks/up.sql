-- Seed history inbox, fix round 1 (task 5):
--   * user_notifications_stamp under itap.seed_context keeps the given read / acknowledgement times instead of
--     now(), but an acknowledgement or read time, once set, is still never changed (set once);
--   * seed_finalize_notifications acknowledges an old high / critical inbox row only when it belongs to no incident
--     or to an acknowledged one: rows of an incident that is still open and unacknowledged are read only. (During the
--     replay every incident is still unacknowledged, so incident rows stay read only; the operator's acknowledgement
--     of the incident is not copied to the inbox.) Everything else is unchanged.
CREATE OR REPLACE FUNCTION itap.user_notifications_stamp() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  seeding constant boolean := itap.seed_context(); -- seeded history: simulated times are kept, not stamped
BEGIN
  IF OLD.acknowledged_at IS NOT NULL THEN
    NEW.acknowledged_at := OLD.acknowledged_at;
  ELSIF NEW.acknowledged_at IS NOT NULL AND NOT seeding THEN
    NEW.acknowledged_at := now();
  END IF;
  IF NEW.read_at IS NOT NULL AND OLD.read_at IS NOT NULL THEN
    NEW.read_at := OLD.read_at;
  ELSIF NEW.read_at IS NOT NULL AND NOT seeding THEN
    NEW.read_at := now();
  END IF;
  IF NEW.acknowledged_at IS NOT NULL AND NEW.read_at IS NULL THEN
    NEW.read_at := NEW.acknowledged_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION itap.seed_finalize_notifications(p_organization uuid, p_until timestamptz)
RETURNS SETOF itap.notification_deliveries
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  cron_at timestamptz;
  ids uuid[];
BEGIN
  PERFORM set_config('itap.seed_context', 'on', true);

  -- 1. The hourly send_digests runs that would have happened.
  FOR cron_at IN
    SELECT DISTINCT date_trunc('hour', d.deliver_after, 'UTC')
             + CASE WHEN d.deliver_after = date_trunc('hour', d.deliver_after, 'UTC') THEN interval '0' ELSE interval '1 hour' END
    FROM itap.notification_deliveries d
    WHERE d.organization_id = p_organization AND d.status = 'pending' AND d.rule_id IS NOT NULL AND d.content ? 'digest'
      AND d.deliver_after IS NOT NULL
    ORDER BY 1
  LOOP
    EXIT WHEN cron_at > least(p_until, now());
    PERFORM itap.send_digests(p_organization, cron_at);
  END LOOP;

  -- 2. Deliveries written by this transaction, at their simulated time.
  SELECT coalesce(array_agg(d.id), '{}') INTO ids
  FROM itap.notification_deliveries d
  WHERE d.organization_id = p_organization AND d.created_at = now();

  WITH timed AS (
    SELECT d.id,
           CASE
             WHEN d.event_id IS NOT NULL THEN
               (SELECT e.occurred_at FROM itap.events e WHERE e.organization_id = d.organization_id AND e.id = d.event_id)
             WHEN d.escalation_step_id IS NOT NULL THEN
               (SELECT max(a.occurred_at) FROM itap.incident_activities a
                WHERE a.organization_id = d.organization_id AND a.incident_id = d.incident_id AND a.kind = 'escalated'
                  AND a.details ->> 'step_id' = d.escalation_step_id::text
                  AND (a.details ->> 'cycle')::integer = d.escalation_cycle)
             WHEN d.content ? 'window_end' THEN (d.content ->> 'window_end')::timestamptz
           END AS sim
    FROM itap.notification_deliveries d
    WHERE d.organization_id = p_organization AND d.id = ANY (ids)
  ),
  planned AS (
    SELECT d.id, t.sim,
           greatest(t.sim, coalesce(d.deliver_after, t.sim)) AS released,
           ((abs(hashtext(d.id::text)) % 36) + 5) * interval '1 second' AS lag,
           d.status = 'pending' AND d.channel <> 'in_app' AND NOT (d.content ? 'digest')
             AND greatest(t.sim, coalesce(d.deliver_after, t.sim)) <= now() AS settle,
           coalesce(d.recipient_address ~* '\.invalid$', false) AS unreachable
    FROM itap.notification_deliveries d
    JOIN timed t ON t.id = d.id
    WHERE t.sim IS NOT NULL
  )
  UPDATE itap.notification_deliveries d SET
    created_at = p.sim,
    status = CASE
      WHEN NOT p.settle THEN d.status
      WHEN p.unreachable THEN 'dead_letter'
      WHEN d.channel = 'email' THEN 'sent'
      ELSE 'delivered'
    END,
    attempts = CASE
      WHEN NOT p.settle THEN d.attempts
      WHEN p.unreachable THEN itap.delivery_max_attempts()
      ELSE 1
    END,
    sent_at = CASE
      WHEN d.channel = 'in_app' AND d.status = 'delivered' THEN p.sim
      WHEN p.settle AND NOT p.unreachable THEN p.released + p.lag
      ELSE d.sent_at
    END,
    delivered_at = CASE
      WHEN d.channel = 'in_app' AND d.status = 'delivered' THEN p.sim
      WHEN p.settle AND NOT p.unreachable AND d.channel <> 'email' THEN p.released + p.lag
      ELSE d.delivered_at
    END,
    error = CASE
      WHEN p.settle AND p.unreachable THEN format('recipient %s is unreachable (.invalid domain)', d.recipient_address)
      ELSE d.error
    END
  FROM planned p
  WHERE d.id = p.id;

  -- Inbox rows of those deliveries: created with them; older than a day: read, high / critical also acknowledged
  -- unless their incident is still unacknowledged.
  UPDATE itap.user_notifications n SET
    created_at = d.created_at,
    read_at = CASE WHEN d.created_at < now() - interval '1 day'
                   THEN d.created_at + ((abs(hashtext(d.id::text)) % 541) + 60) * interval '1 second' END,
    acknowledged_at = CASE WHEN d.created_at < now() - interval '1 day' AND d.priority IN ('high', 'critical')
                             AND (d.incident_id IS NULL OR EXISTS (
                               SELECT 1 FROM itap.incidents i
                               WHERE i.organization_id = d.organization_id AND i.id = d.incident_id AND i.acknowledged_at IS NOT NULL))
                           THEN d.created_at + ((abs(hashtext(d.id::text)) % 541) + 60) * interval '1 second' END
  FROM itap.notification_deliveries d
  WHERE n.organization_id = p_organization AND d.organization_id = p_organization AND n.delivery_id = d.id
    AND d.id = ANY (ids) AND d.channel = 'in_app';

  -- 3. Webhook deliveries written by this transaction: delivered to the sink at the event time.
  UPDATE itap.webhook_deliveries w SET
    created_at = e.occurred_at,
    status = 'sent',
    attempts = 1,
    response_code = 200,
    sent_at = e.occurred_at + ((abs(hashtext(w.id::text)) % 3) + 1) * interval '1 second',
    next_attempt_at = NULL,
    error = NULL
  FROM itap.events e
  WHERE w.organization_id = p_organization AND w.created_at = now() AND w.status = 'pending'
    AND e.organization_id = w.organization_id AND e.id = w.event_id;
  UPDATE itap.webhook_subscriptions s SET last_delivery_status = 'sent', last_delivery_at = x.sent_at
  FROM (
    SELECT w.subscription_id, max(w.sent_at) AS sent_at FROM itap.webhook_deliveries w
    WHERE w.organization_id = p_organization AND w.status = 'sent'
    GROUP BY w.subscription_id
  ) x
  WHERE s.organization_id = p_organization AND s.id = x.subscription_id
    AND (s.last_delivery_at IS NULL OR s.last_delivery_at < x.sent_at);

  PERFORM set_config('itap.seed_context', 'off', true);
  RETURN QUERY SELECT * FROM itap.notification_deliveries d WHERE d.organization_id = p_organization AND d.id = ANY (ids);
END;
$$;
