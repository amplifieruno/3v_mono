-- profile_rostered_at as an interval test (plan-07 task 5, fix round 1): rostered when any window instance of the
-- profile's work schedule overlaps [at - 30 min, at + 30 min] (instead of sampling at, at +/- 30 min). Window
-- semantics as itap.in_windows: local times in the schedule timezone, `days` = ISO weekday the window starts on,
-- from inclusive / to exclusive, to < from = overnight (ends the next day), "24:00" allowed as an end, from = to
-- empty, malformed entries never match and never raise. Only active profiles.
CREATE OR REPLACE FUNCTION itap.profile_rostered_at(p itap.profiles, p_at timestamptz) RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  w itap.work_schedules;
  win jsonb;
  local_day date;
  d date;
  w_from time;
  w_to interval;
  starts timestamptz;
  ends timestamptz;
  time_re constant text := '^([01]?[0-9]|2[0-3]):[0-5][0-9]$';
BEGIN
  IF p.status IS DISTINCT FROM 'active' OR p.work_schedule_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT * INTO w FROM itap.work_schedules x WHERE x.organization_id = p.organization_id AND x.id = p.work_schedule_id;
  IF NOT FOUND OR jsonb_typeof(w.windows) IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;
  local_day := (p_at AT TIME ZONE w.timezone)::date;
  FOR win IN SELECT e FROM jsonb_array_elements(w.windows) e LOOP
    CONTINUE WHEN jsonb_typeof(win) <> 'object' OR jsonb_typeof(win -> 'days') IS DISTINCT FROM 'array';
    CONTINUE WHEN jsonb_typeof(win -> 'from') IS DISTINCT FROM 'string' OR jsonb_typeof(win -> 'to') IS DISTINCT FROM 'string';
    CONTINUE WHEN NOT ((win ->> 'from') ~ time_re AND ((win ->> 'to') ~ time_re OR (win ->> 'to') = '24:00'));
    w_from := (win ->> 'from')::time;
    w_to := CASE WHEN win ->> 'to' = '24:00' THEN interval '24 hours' ELSE (win ->> 'to')::time::interval END;
    CONTINUE WHEN w_to = w_from::interval;
    IF w_to < w_from::interval THEN
      w_to := w_to + interval '1 day';
    END IF;
    -- Window instances starting the day before, on and after the local day of p_at cover +/- 30 minutes.
    FOR d IN SELECT g::date FROM generate_series(local_day - 1, local_day + 1, interval '1 day') g LOOP
      CONTINUE WHEN NOT (win -> 'days') @> to_jsonb(extract(isodow FROM d)::int);
      starts := (d + w_from) AT TIME ZONE w.timezone;
      ends := (d + w_to) AT TIME ZONE w.timezone;
      IF starts < p_at + interval '30 minutes' AND ends > p_at - interval '30 minutes' THEN
        RETURN true;
      END IF;
    END LOOP;
  END LOOP;
  RETURN false;
END;
$$;
