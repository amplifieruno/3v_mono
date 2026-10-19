-- Fix round 1 (task 4): one escalation path for the cron and manual escalation.
-- itap.escalate_one(incident, at, actor, manual, reason) escalates ONE locked incident by one step, now:
--   * a next step exists (policy with steps, not ended / repeating): deliveries of that step (same rules as
--     *_create_escalate_incidents), escalation_step + 1, last_escalated_at = p_at, activity 'escalated'
--     {step, step_no, step_id, step_position, cycle, channel, target, recipient_group_id, on_call_schedule_id,
--     recipients, manual, reason}. A step that reached nobody records why: reason 'no_active_recipients' (group) or
--     'no_on_call_member' (schedule) for the cron; a manual escalation keeps the operator's reason and adds
--     empty_reason.
--   * no policy, or a policy that ended (no repeat): the slice-4 behavior: escalation_step + 1, last_escalated_at,
--     activity {step, manual, reason}.
-- The caller locks the incident and checks eligibility/due time. The activity actor is p_actor (NULL = system).
-- escalate_incidents (cron): p_at = scheduled time, actor NULL, manual false, reason NULL, only due incidents.
-- escalate_incident (manual, org_admin): checks unchanged (session organization, incident_not_found,
-- incident_not_active for resolved/closed); p_at = now(), actor = the session member, manual true, the given reason.
-- A manual escalation therefore sends the next step at once and the cron times the following step from it.

CREATE FUNCTION itap.escalate_one(
  p_incident itap.incidents, p_at timestamptz, p_actor uuid, p_manual boolean, p_reason text
) RETURNS itap.incidents
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org constant uuid := p_incident.organization_id;
  inc itap.incidents := p_incident;
  tz text;
  template uuid;
  nx record;
  step itap.escalation_policy_steps;
  target record;
  recipient uuid;
  vars jsonb;
  resolved integer := 0;
  written integer := 0;
  details jsonb;
  empty_reason text;
  has_step boolean := false;
BEGIN
  IF inc.escalation_policy_id IS NOT NULL THEN
    SELECT * INTO nx FROM itap.next_escalation_step(org, inc.escalation_policy_id, inc.escalation_step);
    has_step := FOUND;
  END IF;
  IF NOT has_step THEN
    UPDATE itap.incidents SET escalation_step = escalation_step + 1, last_escalated_at = p_at
    WHERE organization_id = org AND id = inc.id
    RETURNING * INTO inc;
    INSERT INTO itap.incident_activities (organization_id, incident_id, actor_id, kind, details, occurred_at)
    VALUES (org, inc.id, p_actor, 'escalated',
            jsonb_build_object('step', inc.escalation_step, 'manual', p_manual, 'reason', p_reason), p_at);
    RETURN inc;
  END IF;

  SELECT coalesce(o.timezone, 'UTC') INTO tz FROM itap.organizations o WHERE o.id = org;
  tz := coalesce(tz, 'UTC');
  SELECT t.id INTO template FROM itap.notification_templates t
  WHERE t.organization_id = org AND t.name = 'incident_escalation'
  ORDER BY t.locale, t.id
  LIMIT 1;
  SELECT * INTO step FROM itap.escalation_policy_steps WHERE organization_id = org AND id = nx.step_id;

  vars := jsonb_build_object(
    'event_title', format('Escalation %s: %s %s', inc.escalation_step + 1, inc.code, inc.title),
    'incident_code', inc.code,
    'incident_title', inc.title,
    'severity', inc.severity,
    'priority', itap.severity_priority(inc.severity),
    'facility', (SELECT f.name FROM itap.facilities f WHERE f.organization_id = org AND f.id = inc.facility_id),
    'area', (SELECT a.name FROM itap.areas a WHERE a.organization_id = org AND a.id = inc.area_id),
    'step', inc.escalation_step + 1,
    'cycle', nx.cycle,
    'policy', (SELECT p.name FROM itap.escalation_policies p WHERE p.organization_id = org AND p.id = inc.escalation_policy_id),
    'occurred_at', to_char(inc.created_at AT TIME ZONE tz, 'YYYY-MM-DD HH24:MI') || ' ' || tz
  );

  FOR target IN
    SELECT gm.user_id, gm.external_address FROM itap.recipient_group_members gm
    WHERE step.recipient_group_id IS NOT NULL
      AND gm.organization_id = org AND gm.group_id = step.recipient_group_id
      AND (gm.user_id IS NOT NULL OR gm.channel = step.channel)
    UNION ALL
    SELECT itap.on_call_member(step.on_call_schedule_id, p_at), NULL
    WHERE step.on_call_schedule_id IS NOT NULL
  LOOP
    recipient := CASE WHEN target.user_id IS NOT NULL
                      THEN itap.notification_recipient(org, target.user_id, p_at, true) END;
    CONTINUE WHEN recipient IS NULL AND target.external_address IS NULL;
    resolved := resolved + 1;
    IF itap.write_escalation_delivery(inc, step, nx.cycle, recipient, target.external_address, vars, template, p_at, tz) THEN
      written := written + 1;
    END IF;
  END LOOP;

  UPDATE itap.incidents SET escalation_step = escalation_step + 1, last_escalated_at = p_at
  WHERE organization_id = org AND id = inc.id
  RETURNING * INTO inc;

  IF resolved = 0 THEN
    empty_reason := CASE WHEN step.recipient_group_id IS NOT NULL THEN 'no_active_recipients' ELSE 'no_on_call_member' END;
  END IF;
  details := jsonb_build_object(
    'step', inc.escalation_step, 'step_no', step.step_no, 'step_id', step.id, 'step_position', nx.step_position,
    'cycle', nx.cycle, 'channel', step.channel,
    'target', CASE WHEN step.recipient_group_id IS NOT NULL THEN 'group' ELSE 'on_call' END,
    'recipient_group_id', step.recipient_group_id, 'on_call_schedule_id', step.on_call_schedule_id,
    'recipients', written, 'manual', p_manual, 'reason', coalesce(p_reason, empty_reason)
  );
  IF p_reason IS NOT NULL AND empty_reason IS NOT NULL THEN
    details := details || jsonb_build_object('empty_reason', empty_reason);
  END IF;
  INSERT INTO itap.incident_activities (organization_id, incident_id, actor_id, kind, details, occurred_at)
  VALUES (org, inc.id, p_actor, 'escalated', details, p_at);
  RETURN inc;
END;
$$;

CREATE OR REPLACE FUNCTION itap.escalate_incidents(p_organization uuid, p_at timestamptz) RETURNS SETOF itap.incidents
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  inc itap.incidents;
  nx record;
BEGIN
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
    -- Re-check on the locked row version.
    SELECT * INTO nx FROM itap.next_escalation_step(inc.organization_id, inc.escalation_policy_id, inc.escalation_step);
    CONTINUE WHEN NOT FOUND OR coalesce(inc.last_escalated_at, inc.created_at) + nx.after_minutes * interval '1 minute' > p_at;
    RETURN NEXT itap.escalate_one(inc, p_at, NULL, false, NULL);
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
  RETURN NEXT itap.escalate_one(
    incident, now(), itap.organization_member(org, itap.session_user_id(hasura_session)), true, p_reason
  );
END;
$$;
