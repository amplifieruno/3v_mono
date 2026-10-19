-- Stage C, task 3 (spec §8.2, §6.12): same behavior as *_create_fan_out (rules, subscriptions, quiet hours, digests,
-- inbox, last_triggered_at in fan_out_events), plus:
--   * notification subscriptions with is_active = false receive nothing (unsubscribe keeps history);
--   * webhooks: one pending webhook_deliveries row per active webhook subscription of the organization whose event
--     types (junction; none = nothing) contain the event type, with the JSON body built here. Idempotent via
--     unique (organization_id, subscription_id, event_id) + ON CONFLICT DO NOTHING; the send_webhook event trigger
--     sends new rows. Lock order: written last in the event writer (after notification deliveries); the key contains
--     the event id, which only the writing transaction fans out.

-- The webhook JSON body of an event (keys: event_id, event_type, severity, occurred_at, organization_id, facility_id,
-- area_id, identity_id, profile_id, title, payload).
CREATE FUNCTION itap.webhook_body(p_event itap.events) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object(
    'event_id', p_event.id,
    'event_type', p_event.event_type,
    'severity', p_event.severity,
    'occurred_at', p_event.occurred_at,
    'organization_id', p_event.organization_id,
    'facility_id', p_event.facility_id,
    'area_id', p_event.area_id,
    'identity_id', p_event.identity_id,
    'profile_id', p_event.profile_id,
    'title', p_event.title,
    'payload', coalesce(p_event.payload, '{}'::jsonb)
  );
$$;

CREATE FUNCTION itap.write_webhook_deliveries(p_event itap.events) RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, itap
AS $$
  INSERT INTO itap.webhook_deliveries (organization_id, subscription_id, event_id, event_type, body)
  SELECT s.organization_id, s.id, p_event.id, p_event.event_type, itap.webhook_body(p_event)
  FROM itap.webhook_subscriptions s
  WHERE s.organization_id = p_event.organization_id AND s.is_active
    AND EXISTS (
      SELECT 1 FROM itap.webhook_subscription_event_types t
      WHERE t.organization_id = s.organization_id AND t.subscription_id = s.id AND t.event_type = p_event.event_type
    )
  ORDER BY s.id
  ON CONFLICT (organization_id, subscription_id, event_id) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION itap.fan_out_event(p_event uuid) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  ev itap.events;
  tz text;
  incident uuid;
  vars jsonb;
  r itap.notification_rules;
  s itap.notification_subscriptions;
  target record;
  recipient uuid;
BEGIN
  SELECT * INTO ev FROM itap.events WHERE id = p_event;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT o.timezone INTO tz FROM itap.organizations o WHERE o.id = ev.organization_id;
  tz := coalesce(tz, 'UTC');
  -- The event's first incident (by number), if a rule version opened or extended one in finish_events.
  SELECT i.id INTO incident
  FROM itap.incident_events ie
  JOIN itap.incidents i ON i.organization_id = ie.organization_id AND i.id = ie.incident_id
  WHERE ie.organization_id = ev.organization_id AND ie.event_id = ev.id
  ORDER BY i.number
  LIMIT 1;
  vars := itap.notification_vars(ev, incident, tz);

  FOR r IN SELECT * FROM itap.matching_notification_rules(ev) m WHERE m.recipient_group_id IS NOT NULL LOOP
    FOR target IN
      SELECT gm.channel, gm.external_address,
             CASE WHEN gm.user_id IS NOT NULL THEN itap.notification_recipient(ev.organization_id, gm.user_id, ev.occurred_at, true) END AS user_id
      FROM itap.recipient_group_members gm
      JOIN itap.notification_rule_channels rc
        ON rc.organization_id = gm.organization_id AND rc.rule_id = r.id AND rc.channel = gm.channel
      WHERE gm.organization_id = ev.organization_id AND gm.group_id = r.recipient_group_id
      ORDER BY gm.id
    LOOP
      CONTINUE WHEN target.user_id IS NULL AND target.external_address IS NULL;
      PERFORM itap.write_event_delivery(
        ev, incident, 'rule', r.id, target.user_id, target.external_address, target.channel, r.priority,
        r.template_id, r.digest_mode, vars || jsonb_build_object('rule_name', r.name, 'priority', r.priority), tz
      );
    END LOOP;
  END LOOP;

  FOR s IN
    SELECT * FROM itap.notification_subscriptions x
    WHERE x.organization_id = ev.organization_id AND x.is_active
      AND (x.event_type IS NULL OR x.event_type = ev.event_type)
      AND (x.facility_id IS NULL OR x.facility_id = ev.facility_id)
      AND (x.identity_id IS NULL OR x.identity_id = ev.identity_id)
      AND (x.profile_id IS NULL OR x.profile_id = ev.profile_id)
      AND (x.watch_list_id IS NULL OR x.watch_list_id::text = ev.payload ->> 'watch_list_id')
      AND itap.severity_rank(ev.severity) >= itap.severity_rank(x.min_severity)
    ORDER BY x.id
  LOOP
    recipient := itap.notification_recipient(ev.organization_id, s.user_id, ev.occurred_at, false);
    CONTINUE WHEN recipient IS NULL;
    PERFORM itap.write_event_delivery(
      ev, incident, 'subscription', s.id, recipient, NULL, s.channel, itap.severity_priority(ev.severity), NULL, 'none',
      vars || jsonb_build_object('rule_name', '', 'priority', itap.severity_priority(ev.severity)), tz
    );
  END LOOP;

  PERFORM itap.write_webhook_deliveries(ev);
END;
$$;
