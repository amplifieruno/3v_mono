-- On-call schedules and escalation policies (spec §6.12, §8.3).
-- A schedule is a rotation: members ordered by position, one member per shift of shift_length_hours counted from
-- rotation_start_at (itap.on_call_member). A policy is an ordered list of steps; each step notifies a recipient
-- group or the member currently on call, after_minutes after the previous step (or the incident for step 1).
CREATE TABLE itap.on_call_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  timezone text NOT NULL DEFAULT 'UTC',
  shift_length_hours integer NOT NULL DEFAULT 24,
  rotation_start_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT on_call_schedules_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT on_call_schedules_organization_id_name_key UNIQUE (organization_id, name),
  CONSTRAINT on_call_schedules_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT on_call_schedules_timezone_valid CHECK (itap.is_valid_timezone(timezone)),
  CONSTRAINT on_call_schedules_shift_length_positive CHECK (shift_length_hours > 0)
);
CREATE TRIGGER on_call_schedules_set_updated_at BEFORE UPDATE ON itap.on_call_schedules
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.on_call_schedules
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

-- Rotation order = ascending position (gaps allowed). Only active members can be added; a member who is later
-- deactivated or suspended keeps the row and is skipped by itap.on_call_member.
CREATE TABLE itap.on_call_schedule_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL,
  user_id uuid NOT NULL,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT on_call_schedule_members_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT on_call_schedule_members_organization_id_schedule_id_position_key UNIQUE (organization_id, schedule_id, position),
  CONSTRAINT on_call_schedule_members_organization_id_schedule_id_user_id_key UNIQUE (organization_id, schedule_id, user_id),
  CONSTRAINT on_call_schedule_members_position_nonnegative CHECK (position >= 0),
  CONSTRAINT on_call_schedule_members_schedule_fkey FOREIGN KEY (organization_id, schedule_id)
    REFERENCES itap.on_call_schedules (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT on_call_schedule_members_user_fkey FOREIGN KEY (organization_id, user_id)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX on_call_schedule_members_organization_id_user_id_idx ON itap.on_call_schedule_members (organization_id, user_id);
CREATE TRIGGER on_call_schedule_members_active_member_check BEFORE INSERT OR UPDATE OF user_id ON itap.on_call_schedule_members
  FOR EACH ROW EXECUTE FUNCTION itap.active_member_check('user_id');
CREATE TRIGGER on_call_schedule_members_set_updated_at BEFORE UPDATE ON itap.on_call_schedule_members
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.on_call_schedule_members
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

-- The member on call at p_at, or NULL (unknown schedule, no members, nobody active).
-- Shift index = floor((p_at - rotation_start_at) / shift_length); instants before the start rotate backwards.
-- The slot is index mod N over ALL members ordered by position, so deactivating a member never reshuffles the
-- others; a slot whose member is not active (status <> 'active') passes to the next active member by position,
-- wrapping past the last. Vacation delegates are resolved by the caller (fan-out), not here.
CREATE FUNCTION itap.on_call_member(p_schedule uuid, p_at timestamptz) RETURNS uuid
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
      SELECT sm.user_id, sm.position, om.status
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

CREATE TABLE itap.escalation_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  -- Start again from step 1 after the last step while the incident stays unacknowledged.
  repeat boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT escalation_policies_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT escalation_policies_organization_id_name_key UNIQUE (organization_id, name),
  CONSTRAINT escalation_policies_name_not_blank CHECK (btrim(name) <> '')
);
CREATE TRIGGER escalation_policies_set_updated_at BEFORE UPDATE ON itap.escalation_policies
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.escalation_policies
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

-- Steps are owned by the policy (CASCADE). The target group / schedule is NO ACTION: a group or schedule used
-- by a policy cannot be deleted from under it (remove the step first).
CREATE TABLE itap.escalation_policy_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  policy_id uuid NOT NULL,
  step_no integer NOT NULL,
  after_minutes integer NOT NULL DEFAULT 0,
  recipient_group_id uuid,
  on_call_schedule_id uuid,
  channel text NOT NULL REFERENCES itap.notification_channels (value),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT escalation_policy_steps_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT escalation_policy_steps_organization_id_policy_id_step_no_key UNIQUE (organization_id, policy_id, step_no),
  CONSTRAINT escalation_policy_steps_step_no_positive CHECK (step_no > 0),
  CONSTRAINT escalation_policy_steps_after_minutes_nonnegative CHECK (after_minutes >= 0),
  CONSTRAINT escalation_policy_steps_exactly_one_target CHECK (num_nonnulls(recipient_group_id, on_call_schedule_id) = 1),
  CONSTRAINT escalation_policy_steps_policy_fkey FOREIGN KEY (organization_id, policy_id)
    REFERENCES itap.escalation_policies (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT escalation_policy_steps_group_fkey FOREIGN KEY (organization_id, recipient_group_id)
    REFERENCES itap.recipient_groups (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT escalation_policy_steps_schedule_fkey FOREIGN KEY (organization_id, on_call_schedule_id)
    REFERENCES itap.on_call_schedules (organization_id, id) ON DELETE NO ACTION
);
CREATE INDEX escalation_policy_steps_organization_id_recipient_group_id_idx ON itap.escalation_policy_steps (organization_id, recipient_group_id);
CREATE INDEX escalation_policy_steps_organization_id_on_call_schedule_id_idx ON itap.escalation_policy_steps (organization_id, on_call_schedule_id);
CREATE INDEX escalation_policy_steps_organization_id_channel_idx ON itap.escalation_policy_steps (organization_id, channel);
CREATE TRIGGER escalation_policy_steps_set_updated_at BEFORE UPDATE ON itap.escalation_policy_steps
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.escalation_policy_steps
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
