-- Restores fan_out_event / matching_notification_rules without the shared helpers and drops the dry run.
DROP FUNCTION itap.test_notification_rule(json, uuid, integer);
DROP TABLE itap_results.notification_rule_tests;
CREATE OR REPLACE FUNCTION itap.fan_out_event(p_event uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  ev itap.events;
  tz text;
  incident uuid;
  vars jsonb;
  r itap.notification_rules;
  s itap.notification_subscriptions;
  target record;
  recipient uuid;
  rule_policy uuid;
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

  IF incident IS NOT NULL THEN
    SELECT m.escalation_policy_id INTO rule_policy FROM itap.matching_notification_rules(ev) m
    WHERE m.escalation_policy_id IS NOT NULL
    ORDER BY m.id
    LIMIT 1;
    IF rule_policy IS NOT NULL THEN
      UPDATE itap.incidents i SET escalation_policy_id = rule_policy
      WHERE i.organization_id = ev.organization_id AND i.id = incident
        AND i.escalation_policy_id IS NULL AND i.status = 'open';
    END IF;
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION itap.matching_notification_rules(p_event itap.events)
 RETURNS SETOF itap.notification_rules
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
  SELECT r.* FROM itap.notification_rules r
  WHERE r.organization_id = p_event.organization_id AND r.is_active
    AND EXISTS (
      SELECT 1 FROM itap.notification_rule_event_types t
      WHERE t.organization_id = r.organization_id AND t.rule_id = r.id AND t.event_type = p_event.event_type
    )
    AND itap.notification_conditions_match(r.conditions, p_event)
  ORDER BY r.id;
$function$;

DROP FUNCTION itap.notification_rule_targets(itap.notification_rules, itap.events);
DROP FUNCTION itap.notification_rule_has_event_type(itap.notification_rules, text);
