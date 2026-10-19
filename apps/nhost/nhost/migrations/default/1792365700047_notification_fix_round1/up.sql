-- Fix round 1: on-call skips expired memberships (deterministic on p_at); subscriptions cannot use the webhook channel.
-- The member on call at p_at, or NULL (unknown schedule, no members, nobody active).
-- Shift index = floor((p_at - rotation_start_at) / shift_length); instants before the start rotate backwards.
-- The slot is index mod N over ALL members ordered by position, so deactivating a member never reshuffles the
-- others; a slot whose member is not active (status <> 'active', or expires_at <= p_at) passes to the next active member by position,
-- wrapping past the last. Vacation delegates are resolved by the caller (fan-out), not here.
CREATE OR REPLACE FUNCTION itap.on_call_member(p_schedule uuid, p_at timestamptz) RETURNS uuid
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  sched itap.on_call_schedules;
  shift_index bigint;
  member_count integer;
  slot integer;
  picked uuid;
BEGIN
  SELECT * INTO sched FROM itap.on_call_schedules WHERE id = p_schedule;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT count(*) INTO member_count FROM itap.on_call_schedule_members
  WHERE organization_id = sched.organization_id AND schedule_id = sched.id;
  IF member_count = 0 THEN
    RETURN NULL;
  END IF;
  shift_index := floor(extract(epoch FROM (p_at - sched.rotation_start_at)) / (sched.shift_length_hours * 3600.0))::bigint;
  slot := (((shift_index % member_count) + member_count) % member_count)::integer;
  -- Walk from the slot forward (cyclically) to the first active member.
  SELECT ordered.user_id INTO picked
  FROM (
    SELECT m.user_id, m.status,
           row_number() OVER (ORDER BY m.position) - 1 AS idx
    FROM (
      SELECT sm.user_id, sm.position,
             CASE WHEN om.expires_at IS NOT NULL AND om.expires_at <= p_at THEN 'expired' ELSE om.status END AS status
      FROM itap.on_call_schedule_members sm
      JOIN itap.organization_members om ON om.organization_id = sm.organization_id AND om.user_id = sm.user_id
      WHERE sm.organization_id = sched.organization_id AND sm.schedule_id = sched.id
    ) m
  ) ordered
  WHERE ordered.status = 'active'
  ORDER BY ((ordered.idx - slot + member_count) % member_count)
  LIMIT 1;
  RETURN picked;
END;
$$;

ALTER TABLE itap.notification_subscriptions ADD CONSTRAINT notification_subscriptions_channel_not_webhook CHECK (channel <> 'webhook');
