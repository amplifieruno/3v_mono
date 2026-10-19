-- Report data, part 1 (spec §6.10, plan-07 task 2): one internal function per report type, called only by
-- itap.compute_report. Each returns {columns: [label...], rows: [[cell...]...], metrics: [metric...], summary:
-- [{label, value}...]}; cells are text / numbers (dates and times formatted in the report timezone). Sources are the
-- stats tables (never raw detections), except attendance (tracking sessions per scheduled profile and day).
--   flow:       area_transitions_daily summed per facility and area pair over the period's local days.
--   occupancy:  facility_daily_stats rows of the period.
--   heatmap:    area_hourly_stats per area and facility-local hour of day (areas only, not the facility total).
--   behavior:   identity_activity_stats distribution by visits in the last 30 days (a snapshot as of the last
--               refresh, not bound to the period).
--   attendance: active profiles with a work schedule, per local day of the period up to today on which the schedule
--               has a window: present = first tracking session (sessions.profile_id, report facilities) that day
--               starts no later than 15 minutes after the earliest window start, late = later, absent = none.

-- Everything a data function needs about the report being computed.
CREATE TYPE itap.report_context AS (
  organization_id uuid,
  report_id uuid,
  timezone text,
  start_date date,
  end_date date,
  from_ts timestamptz,
  to_ts timestamptz,
  facility_ids uuid[],
  facilities_explicit boolean,
  segment_ids uuid[],
  incident_id uuid
);

CREATE FUNCTION itap.report_metric(
  p_name text, p_type text, p_value numeric, p_unit text DEFAULT NULL, p_category text DEFAULT NULL,
  p_dimension jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object('name', p_name, 'type', p_type, 'value', round(p_value, 2), 'unit', p_unit,
                            'category', p_category, 'dimension', p_dimension);
$$;

CREATE FUNCTION itap.report_time(p_ts timestamptz, p_tz text) RETURNS text
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT to_char(p_ts AT TIME ZONE p_tz, 'YYYY-MM-DD HH24:MI');
$$;

CREATE FUNCTION itap.report_flow(c itap.report_context) RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH t AS (
    SELECT x.facility_id, x.from_area_id, x.to_area_id, sum(x.count) AS n
    FROM itap.area_transitions_daily x
    WHERE x.organization_id = c.organization_id AND x.facility_id = ANY (c.facility_ids)
      AND x.day BETWEEN c.start_date AND c.end_date
    GROUP BY 1, 2, 3
  ), named AS (
    SELECT f.name AS facility, fa.name AS from_area, ta.name AS to_area, t.n
    FROM t
    JOIN itap.facilities f ON f.organization_id = c.organization_id AND f.id = t.facility_id
    JOIN itap.areas fa ON fa.organization_id = c.organization_id AND fa.id = t.from_area_id
    JOIN itap.areas ta ON ta.organization_id = c.organization_id AND ta.id = t.to_area_id
  )
  SELECT jsonb_build_object(
    'columns', jsonb_build_array('Facility', 'From area', 'To area', 'Transitions'),
    'rows', coalesce(jsonb_agg(jsonb_build_array(facility, from_area, to_area, n)
                               ORDER BY n DESC, facility, from_area, to_area), '[]'::jsonb),
    'metrics', jsonb_build_array(
      itap.report_metric('total_transitions', 'count', coalesce(sum(n), 0), 'transitions'),
      itap.report_metric('distinct_paths', 'count', count(*), 'paths'))
      || coalesce((SELECT jsonb_agg(itap.report_metric('top_path', 'count', n, 'transitions', 'top',
                                    jsonb_build_object('facility', facility, 'from', from_area, 'to', to_area)))
                   FROM (SELECT * FROM named ORDER BY n DESC, facility, from_area, to_area LIMIT 5) top), '[]'::jsonb),
    'summary', '[]'::jsonb)
  FROM named;
$$;

CREATE FUNCTION itap.report_occupancy(c itap.report_context) RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH s AS (
    SELECT f.name AS facility, d.*
    FROM itap.facility_daily_stats d
    JOIN itap.facilities f ON f.organization_id = d.organization_id AND f.id = d.facility_id
    WHERE d.organization_id = c.organization_id AND d.facility_id = ANY (c.facility_ids)
      AND d.day BETWEEN c.start_date AND c.end_date
  )
  SELECT jsonb_build_object(
    'columns', jsonb_build_array('Facility', 'Day', 'Unique identities', 'Known', 'Unknown', 'Visits', 'Guest visits',
                                 'Avg visit minutes', 'Peak occupancy', 'Peak hour'),
    'rows', coalesce(jsonb_agg(jsonb_build_array(facility, to_char(day, 'YYYY-MM-DD'), unique_identities,
                                                 known_identities, unknown_identities, visits, guest_visits,
                                                 avg_visit_minutes, peak_occupancy, peak_hour)
                               ORDER BY facility, day), '[]'::jsonb),
    'metrics', jsonb_build_array(
      itap.report_metric('days', 'count', count(*), 'facility days'),
      itap.report_metric('avg_daily_unique', 'average', avg(unique_identities), 'identities'),
      itap.report_metric('total_visits', 'count', coalesce(sum(visits), 0), 'visits'),
      itap.report_metric('avg_visit_minutes', 'average',
                         sum(avg_visit_minutes * visits) / nullif(sum(visits) FILTER (WHERE avg_visit_minutes IS NOT NULL), 0),
                         'minutes'),
      itap.report_metric('peak_occupancy', 'count', max(peak_occupancy), 'identities'),
      itap.report_metric('known_share', 'percentage', 100.0 * sum(known_identities) / nullif(sum(unique_identities), 0), '%')),
    'summary', '[]'::jsonb)
  FROM s;
$$;

CREATE FUNCTION itap.report_heatmap(c itap.report_context) RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH h AS (
    SELECT f.name AS facility, a.name AS area,
           extract(hour FROM s.hour AT TIME ZONE coalesce(f.timezone, c.timezone))::int AS local_hour,
           sum(s.entries) AS entries, avg(s.unique_identities) AS avg_unique, sum(s.dwell_seconds) AS dwell
    FROM itap.area_hourly_stats s
    JOIN itap.facilities f ON f.organization_id = s.organization_id AND f.id = s.facility_id
    JOIN itap.areas a ON a.organization_id = s.organization_id AND a.id = s.area_id
    WHERE s.organization_id = c.organization_id AND s.facility_id = ANY (c.facility_ids)
      AND s.hour >= c.from_ts AND s.hour < c.to_ts
    GROUP BY 1, 2, 3
  ), by_hour AS (
    SELECT local_hour, sum(entries) AS entries FROM h GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 1
  ), by_area AS (
    SELECT facility, area, sum(entries) AS entries FROM h GROUP BY 1, 2 ORDER BY 3 DESC, 1, 2 LIMIT 1
  )
  SELECT jsonb_build_object(
    'columns', jsonb_build_array('Facility', 'Area', 'Hour', 'Entries', 'Avg unique identities', 'Dwell minutes'),
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_array(facility, area, local_hour, entries, round(avg_unique, 2),
                                                         round(dwell / 60.0, 1))
                                       ORDER BY facility, area, local_hour) FROM h), '[]'::jsonb),
    'metrics', jsonb_build_array(
      itap.report_metric('total_entries', 'count', (SELECT coalesce(sum(entries), 0) FROM h), 'entries'),
      itap.report_metric('active_areas', 'count', (SELECT count(DISTINCT (facility, area)) FROM h), 'areas'))
      || coalesce((SELECT jsonb_build_array(itap.report_metric('busiest_hour', 'count', entries, 'entries', 'peak',
                                            jsonb_build_object('hour', local_hour))) FROM by_hour), '[]'::jsonb)
      || coalesce((SELECT jsonb_build_array(itap.report_metric('busiest_area', 'count', entries, 'entries', 'peak',
                                            jsonb_build_object('facility', facility, 'area', area))) FROM by_area), '[]'::jsonb),
    'summary', '[]'::jsonb);
$$;

CREATE FUNCTION itap.report_behavior(c itap.report_context) RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH s AS (
    SELECT x.*,
           CASE WHEN x.visits_last_30d = 0 THEN 0 WHEN x.visits_last_30d = 1 THEN 1 WHEN x.visits_last_30d <= 4 THEN 2
                WHEN x.visits_last_30d <= 9 THEN 3 ELSE 4 END AS bucket
    FROM itap.identity_activity_stats x
    WHERE x.organization_id = c.organization_id
  ), b AS (
    SELECT bucket, count(*) AS n, avg(avg_dwell_minutes) AS dwell, sum(after_hours_visits_30d) AS after_hours
    FROM s GROUP BY 1
  )
  SELECT jsonb_build_object(
    'columns', jsonb_build_array('Visits in 30 days', 'Identities', 'Avg dwell minutes', 'After-hours visits'),
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_array((ARRAY['0', '1', '2-4', '5-9', '10+'])[bucket + 1], n,
                                                         round(dwell, 2), after_hours) ORDER BY bucket) FROM b),
                     '[]'::jsonb),
    'metrics', jsonb_build_array(
      itap.report_metric('identities', 'count', (SELECT count(*) FROM s), 'identities'),
      itap.report_metric('avg_dwell_minutes', 'average', (SELECT avg(avg_dwell_minutes) FROM s), 'minutes'),
      itap.report_metric('frequent_visitors', 'count', (SELECT count(*) FROM s WHERE visits_last_30d >= 10), 'identities'),
      itap.report_metric('after_hours_share', 'percentage',
                         (SELECT 100.0 * count(*) FILTER (WHERE after_hours_visits_30d > 0) / nullif(count(*), 0) FROM s), '%')),
    'summary', jsonb_build_array(jsonb_build_object(
      'label', 'Activity stats as of',
      'value', (SELECT itap.report_time(max(as_of), c.timezone) FROM s))));
$$;

CREATE FUNCTION itap.report_attendance(c itap.report_context) RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH days AS (
    SELECT d::date AS day
    FROM generate_series(c.start_date, least(c.end_date, (now() AT TIME ZONE c.timezone)::date), interval '1 day') d
  ), scheduled AS (
    SELECT p.id, p.code, p.first_name || ' ' || p.last_name AS name, p.department, w.timezone AS wtz, days.day,
           (SELECT min((win ->> 'from')::time) FROM jsonb_array_elements(w.windows) win
            WHERE (win -> 'days') @> to_jsonb(extract(isodow FROM days.day)::int)) AS start_time
    FROM itap.profiles p
    JOIN itap.work_schedules w ON w.organization_id = p.organization_id AND w.id = p.work_schedule_id
    CROSS JOIN days
    WHERE p.organization_id = c.organization_id AND p.status = 'active'
      AND (p.start_date IS NULL OR p.start_date <= days.day) AND (p.end_date IS NULL OR p.end_date >= days.day)
  ), seen AS (
    SELECT s.*,
           (SELECT min(t.started_at) FROM itap.tracking_sessions t
            WHERE t.organization_id = c.organization_id AND t.profile_id = s.id AND t.facility_id = ANY (c.facility_ids)
              AND t.started_at >= (s.day::timestamp AT TIME ZONE s.wtz)
              AND t.started_at < ((s.day + 1)::timestamp AT TIME ZONE s.wtz)) AS first_seen
    FROM scheduled s
    WHERE s.start_time IS NOT NULL
  ), r AS (
    SELECT seen.*,
           CASE WHEN first_seen IS NULL THEN 'absent'
                WHEN (first_seen AT TIME ZONE wtz) > day + start_time + interval '15 minutes' THEN 'late'
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
