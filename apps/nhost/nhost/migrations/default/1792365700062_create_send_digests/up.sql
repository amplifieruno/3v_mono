-- Digests (spec §8.3 `send_digests`, §6.12). Stage C defers non in_app deliveries of digest-mode rules
-- (content.digest = 'hourly' | 'daily') to the end of their digest window; nothing else sends them (claim / due skip
-- content.digest). itap.send_digests(org, at), called hourly by the send_digests cron with the scheduled time,
-- combines the due items (status pending, deliver_after <= at) per (rule, recipient, channel, window) into ONE new
-- delivery and marks each item `digested` with digested_into = the combined delivery:
--   window:   hourly = the UTC hour of the event (date_trunc('hour', occurred_at, 'UTC'): independent of the writer's
--             session time zone); daily = the event's day in the organization timezone. An item whose event is gone
--             falls back to its deliver_after as the window start.
--   combined: origin = the rule (event_id NULL, so the per-origin key never collides; idempotency comes from the
--             items: they are locked FOR UPDATE in id order and leave `pending` in the same transaction, so a
--             concurrent or repeated run finds nothing), same recipient and channel, the highest item priority,
--             status pending, deliver_after NULL (each item already waited for its window and quiet hours), content
--             {subject, title, body (one line per item, at most 50), template_id NULL, digest_period, window_start,
--             window_end, item_count, items (first 100: delivery_id, event_id, incident_id, title, occurred_at)} -
--             no 'digest' key, so the send_delivery trigger / retry_deliveries cron send it like any delivery.
-- Items whose event happened in one window but were deferred past later windows by quiet hours are digested with
-- their own window when they become due. Recipients were resolved at the event time (like quiet-hours deferrals).
--
-- Status `digested` (terminal, only from pending) <=> digested_into IS NOT NULL (CHECK); digested_into is set once.
-- Also: Stage C's hourly digest boundary now uses date_trunc('hour', occurred_at, 'UTC') (was session time zone),
-- and quiet hours go through itap.quiet_hours_release (same rule as escalation; a week fully covered by quiet
-- windows has no end, so such a member is not deferred).

INSERT INTO itap.notification_delivery_statuses (value, description) VALUES
  ('digested', 'Combined into a digest delivery (digested_into)');

ALTER TABLE itap.notification_deliveries
  ADD COLUMN digested_into uuid,
  ADD CONSTRAINT notification_deliveries_digested_into_fkey FOREIGN KEY (organization_id, digested_into)
    REFERENCES itap.notification_deliveries (organization_id, id) ON DELETE NO ACTION,
  ADD CONSTRAINT notification_deliveries_digested_consistent CHECK ((status = 'digested') = (digested_into IS NOT NULL));
CREATE INDEX notification_deliveries_organization_id_digested_into_idx
  ON itap.notification_deliveries (organization_id, digested_into);

--   pending  -> sent | delivered | failed | retrying | dead_letter | digested
--   retrying -> sent | delivered | failed | dead_letter
--   failed   -> retrying | dead_letter
--   sent     -> delivered | failed
--   delivered, dead_letter, digested: terminal
CREATE OR REPLACE FUNCTION itap.notification_delivery_transition_allowed(p_from text, p_to text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT p_from = p_to OR CASE p_from
    WHEN 'pending' THEN p_to IN ('sent', 'delivered', 'failed', 'retrying', 'dead_letter', 'digested')
    WHEN 'retrying' THEN p_to IN ('sent', 'delivered', 'failed', 'dead_letter')
    WHEN 'failed' THEN p_to IN ('retrying', 'dead_letter')
    WHEN 'sent' THEN p_to IN ('delivered', 'failed')
    ELSE false
  END;
$$;

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

-- Same as *_create_fan_out except the UTC hourly boundary and itap.quiet_hours_release.
CREATE OR REPLACE FUNCTION itap.write_event_delivery(
  p_event itap.events, p_incident uuid, p_origin text, p_origin_id uuid, p_user uuid, p_address text, p_channel text,
  p_priority text, p_template uuid, p_digest text, p_vars jsonb, p_tz text
) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  in_app constant boolean := p_channel = 'in_app';
  v_locale text;
  deliver_at timestamptz;
  v_content jsonb;
  new_id uuid;
BEGIN
  IF p_user IS NOT NULL THEN
    SELECT s.locale INTO v_locale FROM itap.user_settings s WHERE s.user_id = p_user;
  END IF;
  v_content := itap.notification_content(p_event.organization_id, p_template, p_channel, v_locale, p_vars);
  IF NOT in_app THEN
    deliver_at := itap.quiet_hours_release(p_event.organization_id, p_user, p_priority, p_event.occurred_at, p_tz);
    IF p_digest = 'hourly' THEN
      deliver_at := greatest(deliver_at, date_trunc('hour', p_event.occurred_at, 'UTC') + interval '1 hour');
      v_content := v_content || jsonb_build_object('digest', p_digest);
    ELSIF p_digest = 'daily' THEN
      deliver_at := greatest(deliver_at, (((p_event.occurred_at AT TIME ZONE p_tz)::date + 1)::timestamp AT TIME ZONE p_tz));
      v_content := v_content || jsonb_build_object('digest', p_digest);
    END IF;
  END IF;

  INSERT INTO itap.notification_deliveries (
    organization_id, rule_id, subscription_id, event_id, incident_id, recipient_user_id, recipient_address, channel,
    priority, status, deliver_after, content, sent_at, delivered_at
  ) VALUES (
    p_event.organization_id,
    CASE WHEN p_origin = 'rule' THEN p_origin_id END,
    CASE WHEN p_origin = 'subscription' THEN p_origin_id END,
    p_event.id, p_incident, p_user, CASE WHEN p_user IS NULL THEN p_address END, p_channel, p_priority,
    CASE WHEN in_app THEN 'delivered' ELSE 'pending' END,
    deliver_at, v_content,
    CASE WHEN in_app THEN now() END, CASE WHEN in_app THEN now() END
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO new_id;

  IF new_id IS NOT NULL AND in_app AND p_user IS NOT NULL THEN
    INSERT INTO itap.user_notifications (organization_id, user_id, delivery_id, event_id, incident_id, title, body, priority)
    VALUES (p_event.organization_id, p_user, new_id, p_event.id, p_incident, v_content ->> 'title',
            coalesce(v_content ->> 'body', ''), p_priority)
    ON CONFLICT (organization_id, delivery_id) DO NOTHING;
  END IF;
END;
$$;

CREATE FUNCTION itap.send_digests(p_organization uuid, p_at timestamptz) RETURNS SETOF itap.notification_deliveries
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  tz text;
  g record;
  window_end timestamptz;
  rule_name text;
  lines text;
  subject text;
  combined itap.notification_deliveries;
BEGIN
  SELECT o.timezone INTO tz FROM itap.organizations o WHERE o.id = p_organization;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  tz := coalesce(tz, 'UTC');
  -- Blocking lock in id order: a concurrent run waits here and then sees the items digested.
  PERFORM 1 FROM itap.notification_deliveries d
  WHERE d.organization_id = p_organization AND d.status = 'pending' AND d.deliver_after <= p_at
    AND d.rule_id IS NOT NULL AND d.content ? 'digest'
  ORDER BY d.id
  FOR UPDATE;

  FOR g IN
    WITH items AS (
      SELECT d.id, d.rule_id, d.recipient_key, d.recipient_user_id, d.recipient_address, d.channel, d.priority,
             d.event_id, d.incident_id, d.content ->> 'title' AS title, d.content ->> 'digest' AS period,
             coalesce(e.occurred_at, d.created_at) AS occurred_at,
             coalesce(CASE d.content ->> 'digest'
                        WHEN 'hourly' THEN date_trunc('hour', e.occurred_at, 'UTC')
                        WHEN 'daily' THEN date_trunc('day', e.occurred_at, tz)
                      END, d.deliver_after) AS window_start
      FROM itap.notification_deliveries d
      LEFT JOIN itap.events e ON e.organization_id = d.organization_id AND e.id = d.event_id
      WHERE d.organization_id = p_organization AND d.status = 'pending' AND d.deliver_after <= p_at
        AND d.rule_id IS NOT NULL AND d.content ? 'digest'
    )
    SELECT i.rule_id, i.recipient_user_id, i.recipient_address, i.channel, i.period, i.window_start,
           array_agg(i.id ORDER BY i.occurred_at, i.id) AS ids,
           (array_agg(i.priority ORDER BY itap.priority_rank(i.priority) DESC))[1] AS priority,
           count(*)::integer AS n,
           jsonb_agg(jsonb_build_object('delivery_id', i.id, 'event_id', i.event_id, 'incident_id', i.incident_id,
                                        'title', i.title, 'occurred_at', i.occurred_at)
                     ORDER BY i.occurred_at, i.id) AS items
    FROM items i
    GROUP BY i.rule_id, i.recipient_key, i.recipient_user_id, i.recipient_address, i.channel, i.period, i.window_start
    ORDER BY i.rule_id, i.recipient_key, i.channel, i.window_start
  LOOP
    window_end := CASE g.period
      WHEN 'hourly' THEN g.window_start + interval '1 hour'
      WHEN 'daily' THEN ((g.window_start AT TIME ZONE tz) + interval '1 day') AT TIME ZONE tz
    END;
    SELECT r.name INTO rule_name FROM itap.notification_rules r WHERE r.organization_id = p_organization AND r.id = g.rule_id;
    SELECT string_agg(
             '- ' || coalesce(x ->> 'title', '') || ' ('
               || to_char((x ->> 'occurred_at')::timestamptz AT TIME ZONE tz, 'YYYY-MM-DD HH24:MI') || ')',
             E'\n' ORDER BY t.n)
      INTO lines
    FROM jsonb_array_elements(g.items) WITH ORDINALITY AS t (x, n)
    WHERE t.n <= 50;
    IF g.n > 50 THEN
      lines := lines || E'\n' || format('... and %s more', g.n - 50);
    END IF;
    subject := format('[Digest] %s: %s notification%s', rule_name, g.n, CASE WHEN g.n = 1 THEN '' ELSE 's' END);

    INSERT INTO itap.notification_deliveries (
      organization_id, rule_id, recipient_user_id, recipient_address, channel, priority, status, content
    ) VALUES (
      p_organization, g.rule_id, g.recipient_user_id, g.recipient_address, g.channel, g.priority, 'pending',
      jsonb_build_object(
        'template_id', NULL,
        'subject', subject,
        'title', left(subject, 500),
        'body', concat_ws(E'\n',
          format('%s digest, %s - %s (%s)', initcap(coalesce(g.period, 'digest')),
                 to_char(g.window_start AT TIME ZONE tz, 'YYYY-MM-DD HH24:MI'),
                 to_char(coalesce(window_end, p_at) AT TIME ZONE tz, 'YYYY-MM-DD HH24:MI'), tz),
          lines),
        'digest_period', g.period,
        'window_start', g.window_start,
        'window_end', window_end,
        'item_count', g.n,
        'items', (SELECT jsonb_agg(x ORDER BY t.n) FROM jsonb_array_elements(g.items) WITH ORDINALITY AS t (x, n) WHERE t.n <= 100)
      )
    )
    RETURNING * INTO combined;

    UPDATE itap.notification_deliveries SET status = 'digested', digested_into = combined.id
    WHERE organization_id = p_organization AND id = ANY (g.ids);
    RETURN NEXT combined;
  END LOOP;
END;
$$;
