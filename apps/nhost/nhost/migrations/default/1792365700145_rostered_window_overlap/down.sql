-- Restores the sampling version of 1792365700141_after_hours_rostered_staff.
CREATE OR REPLACE FUNCTION itap.profile_rostered_at(p itap.profiles, p_at timestamptz) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT coalesce(bool_or(itap.in_windows(w.windows, w.timezone, p_at)
                          OR itap.in_windows(w.windows, w.timezone, p_at + interval '30 minutes')
                          OR itap.in_windows(w.windows, w.timezone, p_at - interval '30 minutes')), false)
  FROM itap.work_schedules w
  WHERE p.status = 'active' AND w.organization_id = p.organization_id AND w.id = p.work_schedule_id;
$$;
