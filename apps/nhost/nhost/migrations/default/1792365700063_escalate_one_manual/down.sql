-- Restores the task-4 cron loop and the slice-4 manual escalation (bump and log only).
CREATE OR REPLACE FUNCTION itap.escalate_incidents(p_organization uuid, p_at timestamptz) RETURNS SETOF itap.incidents
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  tz text;
  template uuid;
  inc itap.incidents;
  nx record;
  step itap.escalation_policy_steps;
  target record;
  recipient uuid;
  vars jsonb;
  written integer;
BEGIN
  SELECT o.timezone INTO tz FROM itap.organizations o WHERE o.id = p_organization;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  tz := coalesce(tz, 'UTC');
  SELECT t.id INTO template FROM itap.notification_templates t
  WHERE t.organization_id = p_organization AND t.name = 'incident_escalation'
  ORDER BY t.locale, t.id
  LIMIT 1;

  FOR inc IN
    SELECT i.* FROM itap.incidents i
    WHERE i.organization_id = p_organization
      AND i.acknowledged_at IS NULL AND i.status = 'open' AND i.escalation_policy_id IS NOT NULL
      AND i.created_at <= p_at AND (i.last_escalated_at IS NULL OR i.last_escalated_at < p_at)
      AND EXISTS (
        SELECT 1 FROM itap.next_escalation_step(i.organization_id, i.escalation_policy_id, i.escalation_step) x
        WHERE coalesce(i.last_escalated_at, i.created_at) + x.after_minutes * interval '1 minute' <= p_at
      )
    ORDER BY i.id
    FOR UPDATE OF i SKIP LOCKED
  LOOP
    SELECT * INTO nx FROM itap.next_escalation_step(inc.organization_id, inc.escalation_policy_id, inc.escalation_step);
    CONTINUE WHEN NOT FOUND OR coalesce(inc.last_escalated_at, inc.created_at) + nx.after_minutes * interval '1 minute' > p_at;
    SELECT * INTO step FROM itap.escalation_policy_steps WHERE organization_id = p_organization AND id = nx.step_id;

    vars := jsonb_build_object(
      'event_title', format('Escalation %s: %s %s', inc.escalation_step + 1, inc.code, inc.title),
      'incident_code', inc.code,
      'incident_title', inc.title,
      'severity', inc.severity,
      'priority', itap.severity_priority(inc.severity),
      'facility', (SELECT f.name FROM itap.facilities f WHERE f.organization_id = p_organization AND f.id = inc.facility_id),
      'area', (SELECT a.name FROM itap.areas a WHERE a.organization_id = p_organization AND a.id = inc.area_id),
      'step', inc.escalation_step + 1,
      'cycle', nx.cycle,
      'policy', (SELECT p.name FROM itap.escalation_policies p WHERE p.organization_id = p_organization AND p.id = inc.escalation_policy_id),
      'occurred_at', to_char(inc.created_at AT TIME ZONE tz, 'YYYY-MM-DD HH24:MI') || ' ' || tz
    );

    written := 0;
    FOR target IN
      SELECT gm.user_id, gm.external_address FROM itap.recipient_group_members gm
      WHERE step.recipient_group_id IS NOT NULL
        AND gm.organization_id = p_organization AND gm.group_id = step.recipient_group_id
        AND (gm.user_id IS NOT NULL OR gm.channel = step.channel)
      UNION ALL
      SELECT itap.on_call_member(step.on_call_schedule_id, p_at), NULL
      WHERE step.on_call_schedule_id IS NOT NULL
    LOOP
      recipient := CASE WHEN target.user_id IS NOT NULL
                        THEN itap.notification_recipient(p_organization, target.user_id, p_at, true) END;
      CONTINUE WHEN recipient IS NULL AND target.external_address IS NULL;
      IF itap.write_escalation_delivery(inc, step, nx.cycle, recipient, target.external_address, vars, template, p_at, tz) THEN
        written := written + 1;
      END IF;
    END LOOP;

    UPDATE itap.incidents SET escalation_step = escalation_step + 1, last_escalated_at = p_at
    WHERE organization_id = p_organization AND id = inc.id
    RETURNING * INTO inc;
    INSERT INTO itap.incident_activities (organization_id, incident_id, actor_id, kind, details, occurred_at)
    VALUES (
      p_organization, inc.id, NULL, 'escalated',
      jsonb_build_object(
        'step', inc.escalation_step, 'step_no', step.step_no, 'step_id', step.id, 'step_position', nx.step_position,
        'cycle', nx.cycle, 'channel', step.channel,
        'target', CASE WHEN step.recipient_group_id IS NOT NULL THEN 'group' ELSE 'on_call' END,
        'recipient_group_id', step.recipient_group_id, 'on_call_schedule_id', step.on_call_schedule_id,
        'recipients', written, 'manual', false
      ),
      p_at
    );
    RETURN NEXT inc;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION itap.escalate_incident(hasura_session json, p_incident uuid, p_reason text DEFAULT NULL)
RETURNS SETOF itap.incidents
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  incident itap.incidents := itap.lock_incident(org, p_incident);
BEGIN
  IF incident.status IN ('resolved', 'closed') THEN
    PERFORM itap.raise_code('incident_not_active');
  END IF;
  UPDATE itap.incidents
  SET escalation_step = escalation_step + 1, last_escalated_at = now()
  WHERE organization_id = org AND id = p_incident
  RETURNING * INTO incident;
  INSERT INTO itap.incident_activities (organization_id, incident_id, actor_id, kind, details)
  VALUES (
    org, p_incident, itap.organization_member(org, itap.session_user_id(hasura_session)), 'escalated',
    jsonb_build_object('step', incident.escalation_step, 'manual', true, 'reason', p_reason)
  );
  RETURN NEXT incident;
END;
$$;

DROP FUNCTION itap.escalate_one(itap.incidents, timestamptz, uuid, boolean, text);
