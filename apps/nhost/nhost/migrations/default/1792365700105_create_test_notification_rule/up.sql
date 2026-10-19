-- test_notification_rule (spec §8.1, carried from slice 5 into slice 6 task 3): dry-run of a notification rule against
-- the organization's latest events (p_limit, 1..100, default 20; newest first). Per event: would_match, reason
-- (event_type_mismatch | condition_mismatch | match) and, for matches, the recipients Stage C would write (rule
-- channels x recipient group members, vacation delegates, inactive / expired members skipped; distinct
-- channel + recipient pairs as jsonb [{channel, user_id, address}]). Writes nothing; ignores is_active (a rule can be
-- tested before it is switched on). The matching pieces are shared with Stage C: the event-type test
-- (notification_rule_has_event_type, now also used by matching_notification_rules), notification_conditions_match,
-- and the recipient expansion (notification_rule_targets, factored out of fan_out_event, otherwise unchanged).

CREATE FUNCTION itap.notification_rule_has_event_type(p_rule itap.notification_rules, p_event_type text) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT EXISTS (
    SELECT 1 FROM itap.notification_rule_event_types t
    WHERE t.organization_id = p_rule.organization_id AND t.rule_id = p_rule.id AND t.event_type = p_event_type
  );
$$;

-- Recipients of a rule for an event: group members on the rule's channels; users resolved through
-- notification_recipient (vacation delegate; NULL for inactive / expired members, dropped).
CREATE FUNCTION itap.notification_rule_targets(p_rule itap.notification_rules, p_event itap.events)
RETURNS TABLE (channel text, external_address text, user_id uuid)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT x.channel, x.external_address, x.user_id
  FROM (
    SELECT gm.id, gm.channel, gm.external_address,
           CASE WHEN gm.user_id IS NOT NULL
                THEN itap.notification_recipient(p_event.organization_id, gm.user_id, p_event.occurred_at, true) END AS user_id
    FROM itap.recipient_group_members gm
    JOIN itap.notification_rule_channels rc
      ON rc.organization_id = gm.organization_id AND rc.rule_id = p_rule.id AND rc.channel = gm.channel
    WHERE gm.organization_id = p_event.organization_id AND gm.group_id = p_rule.recipient_group_id
  ) x
  WHERE x.user_id IS NOT NULL OR x.external_address IS NOT NULL
  ORDER BY x.id;
$$;

CREATE OR REPLACE FUNCTION itap.matching_notification_rules(p_event itap.events)
 RETURNS SETOF itap.notification_rules
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
  SELECT r.* FROM itap.notification_rules r
  WHERE r.organization_id = p_event.organization_id AND r.is_active
    AND itap.notification_rule_has_event_type(r, p_event.event_type)
    AND itap.notification_conditions_match(r.conditions, p_event)
  ORDER BY r.id;
$function$;

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
    FOR target IN SELECT * FROM itap.notification_rule_targets(r, ev) LOOP
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

-- Row type of itap.test_notification_rule (stores nothing).
CREATE TABLE itap_results.notification_rule_tests (
  organization_id uuid NOT NULL,
  rule_id uuid NOT NULL,
  event_id uuid NOT NULL,
  event_type text NOT NULL,
  severity text NOT NULL,
  occurred_at timestamptz NOT NULL,
  title text NOT NULL,
  would_match boolean NOT NULL,
  reason text NOT NULL,
  recipient_count integer NOT NULL,
  recipients jsonb NOT NULL
);

CREATE FUNCTION itap.test_notification_rule(hasura_session json, p_rule uuid, p_limit integer DEFAULT 20)
RETURNS SETOF itap_results.notification_rule_tests
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org constant uuid := itap.session_organization(hasura_session);
  n constant integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  r itap.notification_rules;
BEGIN
  SELECT * INTO r FROM itap.notification_rules x WHERE x.organization_id = org AND x.id = p_rule;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('notification_rule_not_found');
  END IF;
  RETURN QUERY
  WITH latest AS MATERIALIZED (
    SELECT e FROM itap.events e WHERE e.organization_id = org ORDER BY e.occurred_at DESC, e.id DESC LIMIT n
  )
  SELECT org, r.id, (l.e).id, (l.e).event_type, (l.e).severity, (l.e).occurred_at, (l.e).title,
         j.reason = 'match', j.reason, coalesce(t.n, 0), coalesce(t.recipients, '[]'::jsonb)
  FROM latest l
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN NOT itap.notification_rule_has_event_type(r, (l.e).event_type) THEN 'event_type_mismatch'
      WHEN NOT itap.notification_conditions_match(r.conditions, l.e) THEN 'condition_mismatch'
      ELSE 'match'
    END AS reason
  ) j
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS n,
           jsonb_agg(jsonb_build_object('channel', d.channel, 'user_id', d.user_id, 'address', d.address)
                     ORDER BY d.channel, d.user_id NULLS FIRST, d.address) AS recipients
    FROM (
      SELECT DISTINCT tg.channel, tg.user_id, CASE WHEN tg.user_id IS NULL THEN tg.external_address END AS address
      FROM itap.notification_rule_targets(r, l.e) tg
    ) d
  ) t ON j.reason = 'match'
  ORDER BY (l.e).occurred_at DESC, (l.e).id DESC;
END;
$$;
