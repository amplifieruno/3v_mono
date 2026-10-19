-- Incident escalation (spec §8.3 `escalate`, §6.9, §6.12; Review Focus 3). Called per organization by the escalate
-- cron (every minute) with the run's scheduled_time; admin secret only.
--
-- Step arithmetic: incidents.escalation_step counts the escalations taken so far (automatic and manual), across
-- cycles. With the policy's steps ordered by step_no (n steps, gaps allowed), the next escalation k = escalation_step
-- uses step (k mod n) in cycle (k div n); without repeat the policy ends once k = n. The next step is due when
-- p_at >= coalesce(last_escalated_at, created_at) + its after_minutes (created_at = the triggering event time).
-- Steps edited or removed while an incident is escalating apply from the next escalation on.
--
-- One step per incident per run, and last_escalated_at := p_at (the actual escalation time, not the due time): an
-- old incident never escalated (e.g. back-dated history) gets its next single step now and the following one
-- after_minutes later, never a burst of catch-up steps. A retry of the same scheduled time is a no-op
-- (last_escalated_at < p_at is required), as is an older scheduled time delivered late.
--
-- Eligible: status = 'open', acknowledged_at IS NULL, an escalation policy. Acknowledging, investigating or
-- resolving stops escalation (status leaves open). Rows are locked FOR UPDATE SKIP LOCKED in id order: an incident
-- being acknowledged / extended right now is skipped and retried by the next run.
--
-- Recipients at p_at (itap.notification_recipient: active, unexpired members; vacation delegate one hop):
--   group step:   user members of the group (whatever their group channel) on the step channel, and external
--                 addresses whose group channel is the step channel (an address belongs to its channel);
--   on-call step: itap.on_call_member(schedule, p_at) (skips inactive / expired members).
-- Deliveries (origin escalation_step_id + escalation_cycle + incident_id, priority from the incident severity):
-- in_app -> delivered at once + inbox row; other channels -> pending (send_delivery trigger), deferred to the end of
-- the recipient's quiet hours unless critical. Idempotent per (step, incident, cycle, recipient) via the unique index.
-- Activity: incident_activities 'escalated' {step, step_no, step_id, cycle, channel, target, recipients, manual: false}
-- at p_at, actor NULL (system).
-- Content: the organization's template family named 'incident_escalation' (recipient locale first) when it exists,
-- else fallback text. Variables: event_title, incident_code, incident_title, severity, facility, area, step, cycle,
-- policy, priority, occurred_at (incident time in the organization timezone).

-- When a non in_app delivery to p_user at p_at must wait for the end of the member's quiet hours (organization
-- timezone p_tz): that instant, else NULL (no user, critical priority, outside quiet hours, or windows covering the
-- whole week - itap.windows_end finds no end, and a member who is never reachable is not deferred forever).
CREATE FUNCTION itap.quiet_hours_release(
  p_organization uuid, p_user uuid, p_priority text, p_at timestamptz, p_tz text
) RETURNS timestamptz
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  quiet jsonb;
  quiet_end timestamptz;
BEGIN
  IF p_user IS NULL OR p_priority = 'critical' THEN
    RETURN NULL;
  END IF;
  SELECT m.quiet_hours INTO quiet FROM itap.organization_members m
  WHERE m.organization_id = p_organization AND m.user_id = p_user;
  IF quiet IS NULL THEN
    RETURN NULL;
  END IF;
  quiet_end := itap.windows_end(quiet, p_tz, p_at);
  RETURN CASE WHEN quiet_end > p_at THEN quiet_end END;
END;
$$;

-- The next escalation of an incident that has taken p_taken escalations under p_policy: the step, its after_minutes,
-- its position (1-based) and the cycle. No row when the policy has no steps or ended (no repeat).
CREATE FUNCTION itap.next_escalation_step(p_organization uuid, p_policy uuid, p_taken integer)
RETURNS TABLE (step_id uuid, after_minutes integer, step_position integer, cycle integer)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT s.id, s.after_minutes, s.idx::integer + 1, (p_taken / s.n)::integer
  FROM (
    SELECT st.id, st.after_minutes, row_number() OVER (ORDER BY st.step_no) - 1 AS idx, count(*) OVER () AS n
    FROM itap.escalation_policy_steps st
    WHERE st.organization_id = p_organization AND st.policy_id = p_policy
  ) s
  JOIN itap.escalation_policies p ON p.organization_id = p_organization AND p.id = p_policy
  WHERE s.idx = p_taken % s.n AND (p.repeat OR p_taken < s.n);
$$;

-- Writes one escalation delivery (and its inbox row when in_app and new). True when the row is new.
CREATE FUNCTION itap.write_escalation_delivery(
  p_incident itap.incidents, p_step itap.escalation_policy_steps, p_cycle integer, p_user uuid, p_address text,
  p_vars jsonb, p_template uuid, p_at timestamptz, p_tz text
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  in_app constant boolean := p_step.channel = 'in_app';
  v_priority constant text := itap.severity_priority(p_incident.severity);
  v_locale text;
  v_content jsonb;
  new_id uuid;
BEGIN
  IF p_user IS NOT NULL THEN
    SELECT s.locale INTO v_locale FROM itap.user_settings s WHERE s.user_id = p_user;
  END IF;
  v_content := itap.notification_content(p_incident.organization_id, p_template, p_step.channel, v_locale, p_vars);
  INSERT INTO itap.notification_deliveries (
    organization_id, escalation_step_id, escalation_cycle, incident_id, recipient_user_id, recipient_address, channel,
    priority, status, deliver_after, content, sent_at, delivered_at
  ) VALUES (
    p_incident.organization_id, p_step.id, p_cycle, p_incident.id, p_user, CASE WHEN p_user IS NULL THEN p_address END,
    p_step.channel, v_priority,
    CASE WHEN in_app THEN 'delivered' ELSE 'pending' END,
    CASE WHEN NOT in_app THEN itap.quiet_hours_release(p_incident.organization_id, p_user, v_priority, p_at, p_tz) END,
    v_content,
    CASE WHEN in_app THEN p_at END, CASE WHEN in_app THEN p_at END
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO new_id;

  IF new_id IS NOT NULL AND in_app AND p_user IS NOT NULL THEN
    INSERT INTO itap.user_notifications (organization_id, user_id, delivery_id, incident_id, title, body, priority, created_at)
    VALUES (p_incident.organization_id, p_user, new_id, p_incident.id, v_content ->> 'title',
            coalesce(v_content ->> 'body', ''), v_priority, p_at)
    ON CONFLICT (organization_id, delivery_id) DO NOTHING;
  END IF;
  RETURN new_id IS NOT NULL;
END;
$$;

CREATE FUNCTION itap.escalate_incidents(p_organization uuid, p_at timestamptz) RETURNS SETOF itap.incidents
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
