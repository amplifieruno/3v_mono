-- Stage C (spec §8.2): notification fan-out of a newly written event. Internal (not tracked); called by
-- itap.fan_out_events from finish_events and emit_device_event, in the writer's transaction.
--   rules:         active notification rules with the event's type (junction) whose conditions match and that have
--                  a recipient group (a rule without one has no audience: nothing). Each group member whose channel
--                  is one of the rule's channels gets one delivery on that channel with the rule's priority.
--   subscriptions: every set filter matches (event_type, facility, identity, profile, watch list = payload
--                  watch_list_id) and severity rank >= min_severity; priority from the severity.
--   recipients:    members must be active and not expired at the event time (spec §4.2: deactivated members get
--                  nothing); a group member on vacation at the event time with an active delegate is replaced by
--                  the delegate (one hop; rules only, subscriptions are personal); external addresses as they are.
--   channels:      in_app -> delivered at once + inbox row; others -> pending, deliver_after = end of the recipient's
--                  quiet hours (organization timezone) when the event time is inside them and the priority is not
--                  critical (Review Focus 5); digest rules (hourly/daily) defer non-in_app deliveries to the end of the
--                  digest period (content.digest; aggregated by the digest cron).
--   content:       {template_id, subject, body, title} rendered by itap.render_template from the rule template's
--                  family (same template name) for the delivery channel, recipient locale first; else fallback text.
-- Idempotent: per-origin unique indexes + ON CONFLICT DO NOTHING; an inbox row only for a newly written delivery.

-- The user who receives a delivery meant for p_user at p_at: NULL when p_user is not an active, unexpired member;
-- with p_delegate, their vacation delegate while vacation_until > p_at (when the delegate is active and unexpired).
CREATE FUNCTION itap.notification_recipient(p_organization uuid, p_user uuid, p_at timestamptz, p_delegate boolean)
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT CASE
    WHEN p_delegate AND m.vacation_until > p_at AND d.user_id IS NOT NULL THEN d.user_id
    ELSE m.user_id
  END
  FROM itap.organization_members m
  LEFT JOIN itap.organization_members d
    ON d.organization_id = m.organization_id AND d.user_id = m.vacation_delegate_user_id
   AND d.status = 'active' AND (d.expires_at IS NULL OR d.expires_at > p_at)
  WHERE m.organization_id = p_organization AND m.user_id = p_user
    AND m.status = 'active' AND (m.expires_at IS NULL OR m.expires_at > p_at);
$$;

-- Template variables of an event: event_title, event_type, severity, facility, area, device, identity_code,
-- profile_name, incident_code, occurred_at ('YYYY-MM-DD HH24:MI <tz>' in the organization timezone).
CREATE FUNCTION itap.notification_vars(p_event itap.events, p_incident uuid, p_tz text) RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT jsonb_build_object(
    'event_title', p_event.title,
    'event_type', p_event.event_type,
    'severity', p_event.severity,
    'facility', (SELECT f.name FROM itap.facilities f WHERE f.organization_id = p_event.organization_id AND f.id = p_event.facility_id),
    'area', (SELECT a.name FROM itap.areas a WHERE a.organization_id = p_event.organization_id AND a.id = p_event.area_id),
    'device', (SELECT d.name FROM itap.devices d WHERE d.organization_id = p_event.organization_id AND d.id = p_event.device_id),
    'identity_code', (SELECT i.code FROM itap.identities i WHERE i.organization_id = p_event.organization_id AND i.id = p_event.identity_id),
    'profile_name', (SELECT p.first_name || ' ' || p.last_name FROM itap.profiles p
                     WHERE p.organization_id = p_event.organization_id AND p.id = p_event.profile_id),
    'incident_code', (SELECT i.code FROM itap.incidents i WHERE i.organization_id = p_event.organization_id AND i.id = p_incident),
    'occurred_at', to_char(p_event.occurred_at AT TIME ZONE p_tz, 'YYYY-MM-DD HH24:MI') || ' ' || p_tz
  );
$$;

-- Rendered content for one delivery. The template is chosen from the family of p_template (same name) for p_channel:
-- the recipient's locale first, then the locale of p_template, then any. No template -> fallback text.
CREATE FUNCTION itap.notification_content(
  p_organization uuid, p_template uuid, p_channel text, p_locale text, p_vars jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  base itap.notification_templates;
  t itap.notification_templates;
  subject text;
  body text;
BEGIN
  IF p_template IS NOT NULL THEN
    SELECT * INTO base FROM itap.notification_templates WHERE organization_id = p_organization AND id = p_template;
    SELECT * INTO t FROM itap.notification_templates x
    WHERE x.organization_id = p_organization AND x.name = base.name AND x.channel = p_channel
    ORDER BY x.locale = coalesce(p_locale, '') DESC, x.locale = base.locale DESC, x.locale
    LIMIT 1;
  END IF;
  IF t.id IS NOT NULL THEN
    subject := nullif(btrim(itap.render_template(t.subject, p_vars)), '');
    body := itap.render_template(t.body, p_vars);
  ELSE
    subject := '[' || (p_vars ->> 'severity') || '] ' || (p_vars ->> 'event_title');
    body := concat_ws(', ', p_vars ->> 'event_title',
                      nullif(concat_ws(' / ', p_vars ->> 'facility', p_vars ->> 'area'), ''),
                      p_vars ->> 'occurred_at');
  END IF;
  RETURN jsonb_build_object(
    'template_id', t.id, 'subject', subject, 'body', body,
    'title', left(coalesce(subject, p_vars ->> 'event_title'), 500)
  );
END;
$$;

-- Writes one delivery (and for a new in_app delivery its inbox row). p_origin: 'rule' | 'subscription'.
CREATE FUNCTION itap.write_event_delivery(
  p_event itap.events, p_incident uuid, p_origin text, p_origin_id uuid, p_user uuid, p_address text, p_channel text,
  p_priority text, p_template uuid, p_digest text, p_vars jsonb, p_tz text
) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  in_app constant boolean := p_channel = 'in_app';
  quiet jsonb;
  v_locale text;
  quiet_end timestamptz;
  deliver_at timestamptz;
  v_content jsonb;
  new_id uuid;
BEGIN
  IF p_user IS NOT NULL THEN
    SELECT m.quiet_hours INTO quiet FROM itap.organization_members m
    WHERE m.organization_id = p_event.organization_id AND m.user_id = p_user;
    SELECT s.locale INTO v_locale FROM itap.user_settings s WHERE s.user_id = p_user;
  END IF;
  v_content := itap.notification_content(p_event.organization_id, p_template, p_channel, v_locale, p_vars);
  IF NOT in_app THEN
    IF quiet IS NOT NULL AND p_priority <> 'critical' THEN
      quiet_end := itap.windows_end(quiet, p_tz, p_event.occurred_at);
      IF quiet_end > p_event.occurred_at THEN
        deliver_at := quiet_end;
      END IF;
    END IF;
    IF p_digest = 'hourly' THEN
      deliver_at := greatest(deliver_at, date_trunc('hour', p_event.occurred_at) + interval '1 hour');
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

-- Active rules of the event's type whose conditions match (with or without a recipient group), rule id order.
CREATE FUNCTION itap.matching_notification_rules(p_event itap.events) RETURNS SETOF itap.notification_rules
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT r.* FROM itap.notification_rules r
  WHERE r.organization_id = p_event.organization_id AND r.is_active
    AND EXISTS (
      SELECT 1 FROM itap.notification_rule_event_types t
      WHERE t.organization_id = r.organization_id AND t.rule_id = r.id AND t.event_type = p_event.event_type
    )
    AND itap.notification_conditions_match(r.conditions, p_event)
  ORDER BY r.id;
$$;

-- Notification priority of a subscription delivery: the event severity on the priority scale (info -> low).
CREATE FUNCTION itap.severity_priority(p_severity text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_severity WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high' WHEN 'medium' THEN 'medium' ELSE 'low' END;
$$;

CREATE FUNCTION itap.fan_out_event(p_event uuid) RETURNS void
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
    WHERE x.organization_id = ev.organization_id
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
END;
$$;

-- Stage C for a writer's new events (in order), then notification_rules.last_triggered_at (latest matching event
-- time; not audited, does not bump updated_at) one UPDATE per rule in rule id order. Lock order: this runs last in
-- an event writer (after event keys, incidents and event rule counters); delivery keys contain the event id, which
-- only the transaction that wrote the event fans out, so no writer waits for another's delivery key.
CREATE FUNCTION itap.fan_out_events(p_organization uuid, p_events uuid[]) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  ev_id uuid;
  r record;
BEGIN
  IF p_events IS NULL OR cardinality(p_events) = 0 THEN
    RETURN;
  END IF;
  FOR ev_id IN
    SELECT e.id FROM unnest(p_events) WITH ORDINALITY AS x (id, n)
    JOIN itap.events e ON e.organization_id = p_organization AND e.id = x.id
    ORDER BY x.n
  LOOP
    PERFORM itap.fan_out_event(ev_id);
  END LOOP;
  FOR r IN
    SELECT m.id, max(e.occurred_at) AS last_at
    FROM itap.events e
    CROSS JOIN LATERAL itap.matching_notification_rules(e) m
    WHERE e.organization_id = p_organization AND e.id = ANY (p_events)
    GROUP BY m.id
    ORDER BY m.id
  LOOP
    UPDATE itap.notification_rules nr
    SET last_triggered_at = greatest(nr.last_triggered_at, r.last_at)
    WHERE nr.organization_id = p_organization AND nr.id = r.id
      AND nr.last_triggered_at IS DISTINCT FROM greatest(nr.last_triggered_at, r.last_at);
  END LOOP;
END;
$$;
