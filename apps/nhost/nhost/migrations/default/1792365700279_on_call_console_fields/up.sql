-- Console support for on-call schedules (read by org_admin through the existing select permission):
-- * on_call_schedules.on_call_user_id: the member on call now, exactly as the escalation cron picks them
--   (itap.on_call_member(schedule, now()): rotation by position, inactive or expired members passed over).
--   NULL when the schedule has no members or nobody in it is active. Vacation delegates are not applied here
--   (the fan-out resolves them when it sends).
-- * on_call_schedules.shift_ends_at: when the current shift ends (the next hand-over of the rotation).
CREATE FUNCTION itap.on_call_schedule_on_call_user_id(schedule_row itap.on_call_schedules) RETURNS uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT itap.on_call_member(schedule_row.id, now());
$$;

CREATE FUNCTION itap.on_call_schedule_shift_ends_at(schedule_row itap.on_call_schedules) RETURNS timestamptz
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT schedule_row.rotation_start_at + make_interval(hours => schedule_row.shift_length_hours) * (
    floor(extract(epoch FROM (now() - schedule_row.rotation_start_at)) / (schedule_row.shift_length_hours * 3600.0)) + 1
  );
$$;
