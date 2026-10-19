-- Seed-only support for the replayed history (slice 5 task 5, design §9). Admin secret only (no role).
-- The replay writes the past through the live pipeline, so Stage C, escalation and digests stamp their rows with the
-- seed transaction's now(). Two functions turn those rows into history:
--
--   itap.seed_escalate_incident(incident, policy, at): escalates ONE incident by one step at the simulated instant
--     `at` through itap.escalate_one (the cron path: actor NULL, manual false); `policy` (optional) is set on the
--     incident first. No eligibility checks: the seed decides when history escalated (before the acknowledgement).
--
--   itap.seed_finalize_notifications(organization, until): called at the end of a seed transaction.
--     1. digests: send_digests at every hourly cron instant (deliver_after rounded up to the hour) of the
--        organization's pending digest items up to least(until, now());
--     2. every notification delivery the transaction wrote (created_at = now()) gets created_at = its simulated
--        time: the event time (rule / subscription), the 'escalated' activity of its step and cycle (escalation), or
--        window_end (combined digest). Rows without one are left alone.
--        in_app: sent_at = delivered_at = that time; the inbox row is created then and, when older than one day,
--        read (low / medium) or read and acknowledged (high / critical) 1-10 minutes later (the acknowledgement is
--        copied to the delivery by trigger).
--        other channels, pending and not a digest item, released (greatest(time, deliver_after)) before now(): what
--        the stub providers do (notifications/channels.ts): an address in the .invalid domain -> dead_letter after
--        delivery_max_attempts() attempts; email -> sent; sms / push / webhook -> delivered; 5-40 s after release.
--        Rows released later stay pending for the live sender.
--     3. webhook deliveries the transaction wrote, still pending: created_at = event time, sent 1-3 s later with
--        response_code 200 and one attempt (the dev sink answers 200); the subscription's last delivery follows.
--        The signature is not computed here (the seed signs the stored body like the sender, in TypeScript).
--     Returns the notification deliveries it finalized. Jitter is derived from the row id (deterministic).
--
-- Guards: created_at of notification_deliveries / webhook_deliveries is immutable, and user_notifications read_at /
-- acknowledged_at are stamped with now(). Both yield only while the transaction-local flag itap.seed_context is 'on',
-- which only seed_finalize_notifications sets (and resets before returning), like itap.merge_context. Status
-- transitions and every other immutable column stay guarded.

CREATE FUNCTION itap.seed_context() RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(current_setting('itap.seed_context', true), '') = 'on';
$$;

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
  mutable text[] := ARRAY['status', 'attempts', 'response_code', 'signature', 'sent_at', 'next_attempt_at', 'error'];
BEGIN
  IF itap.seed_context() THEN
    mutable := mutable || 'created_at'::text;
  END IF;
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
  IF itap.seed_context() THEN
    RETURN NEW; -- seeded history: the simulated read / acknowledgement times are kept
  END IF;
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

CREATE FUNCTION itap.seed_escalate_incident(p_incident uuid, p_at timestamptz, p_policy uuid DEFAULT NULL)
RETURNS SETOF itap.incidents
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  inc itap.incidents;
BEGIN
  SELECT * INTO inc FROM itap.incidents WHERE id = p_incident FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF p_policy IS NOT NULL AND inc.escalation_policy_id IS DISTINCT FROM p_policy THEN
    UPDATE itap.incidents SET escalation_policy_id = p_policy
    WHERE organization_id = inc.organization_id AND id = inc.id
    RETURNING * INTO inc;
  END IF;
  RETURN NEXT itap.escalate_one(inc, p_at, NULL, false, NULL);
END;
$$;

CREATE FUNCTION itap.seed_finalize_notifications(p_organization uuid, p_until timestamptz)
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

  -- Inbox rows of those deliveries: created with them; older than a day: read, high / critical also acknowledged.
  UPDATE itap.user_notifications n SET
    created_at = d.created_at,
    read_at = CASE WHEN d.created_at < now() - interval '1 day'
                   THEN d.created_at + ((abs(hashtext(d.id::text)) % 541) + 60) * interval '1 second' END,
    acknowledged_at = CASE WHEN d.created_at < now() - interval '1 day' AND d.priority IN ('high', 'critical')
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
