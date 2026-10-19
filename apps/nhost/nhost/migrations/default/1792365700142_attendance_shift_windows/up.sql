-- Attendance for overnight and around-the-clock schedules (plan-07 task 5, seed night shift). A scheduled day is
-- matched against the first tracking session from 2 hours before the earliest window start of that day up to 22 hours
-- after it (instead of the local calendar day), so an overnight shift (22:00-06:00) owns its own arrival, not the
-- departure of the previous night; a day with a window covering the whole day (00:00-24:00) has no start to be late
-- for: seen = present. Otherwise unchanged from 1792365700124_create_report_data_activity.

CREATE OR REPLACE FUNCTION itap.report_attendance(c itap.report_context) RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH days AS (
    SELECT d::date AS day
    FROM generate_series(c.start_date, least(c.end_date, (now() AT TIME ZONE c.timezone)::date), interval '1 day') d
  ), scheduled AS (
    SELECT p.id, p.code, p.first_name || ' ' || p.last_name AS name, p.department, w.timezone AS wtz, days.day,
           (SELECT min((win ->> 'from')::time) FROM jsonb_array_elements(w.windows) win
            WHERE (win -> 'days') @> to_jsonb(extract(isodow FROM days.day)::int)) AS start_time,
           EXISTS (SELECT 1 FROM jsonb_array_elements(w.windows) win
                   WHERE (win -> 'days') @> to_jsonb(extract(isodow FROM days.day)::int)
                     AND win ->> 'from' IN ('0:00', '00:00') AND win ->> 'to' = '24:00') AS all_day
    FROM itap.profiles p
    JOIN itap.work_schedules w ON w.organization_id = p.organization_id AND w.id = p.work_schedule_id
    CROSS JOIN days
    WHERE p.organization_id = c.organization_id AND p.status = 'active'
      AND (p.start_date IS NULL OR p.start_date <= days.day) AND (p.end_date IS NULL OR p.end_date >= days.day)
  ), seen AS (
    SELECT s.*,
           (SELECT min(t.started_at) FROM itap.tracking_sessions t
            WHERE t.organization_id = c.organization_id AND t.profile_id = s.id AND t.facility_id = ANY (c.facility_ids)
              AND t.started_at >= ((s.day + s.start_time - interval '2 hours') AT TIME ZONE s.wtz)
              AND t.started_at < ((s.day + s.start_time + interval '22 hours') AT TIME ZONE s.wtz)) AS first_seen
    FROM scheduled s
    WHERE s.start_time IS NOT NULL
  ), r AS (
    SELECT seen.*,
           CASE WHEN first_seen IS NULL THEN 'absent'
                WHEN NOT all_day AND (first_seen AT TIME ZONE wtz) > day + start_time + interval '15 minutes' THEN 'late'
                ELSE 'present' END AS status
    FROM seen
  )
  SELECT jsonb_build_object(
    'columns', jsonb_build_array('Profile', 'Name', 'Department', 'Day', 'Scheduled start', 'First seen', 'Status'),
    'rows', coalesce(jsonb_agg(jsonb_build_array(code, name, department, to_char(day, 'YYYY-MM-DD'),
                                                 to_char(start_time, 'HH24:MI'), itap.report_time(first_seen, wtz), status)
                               ORDER BY day, name, code), '[]'::jsonb),
    'metrics', jsonb_build_array(
      itap.report_metric('scheduled_days', 'count', count(*), 'profile days'),
      itap.report_metric('present', 'count', count(*) FILTER (WHERE status = 'present'), 'profile days'),
      itap.report_metric('late', 'count', count(*) FILTER (WHERE status = 'late'), 'profile days'),
      itap.report_metric('absent', 'count', count(*) FILTER (WHERE status = 'absent'), 'profile days'),
      itap.report_metric('attendance_rate', 'percentage', 100.0 * count(*) FILTER (WHERE status <> 'absent') / nullif(count(*), 0), '%'),
      itap.report_metric('punctuality', 'percentage',
                         100.0 * count(*) FILTER (WHERE status = 'present') / nullif(count(*) FILTER (WHERE status <> 'absent'), 0), '%')),
    'summary', jsonb_build_array(jsonb_build_object('label', 'Late after', 'value', '15 minutes past the scheduled start')))
  FROM r;
$$;
