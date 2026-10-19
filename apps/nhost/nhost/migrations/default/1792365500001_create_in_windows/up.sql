-- Schedule windows (spec 6.0): [{ "days": [1..7], "from": "HH:MM", "to": "HH:MM" }].
-- days are ISO weekdays (1 = Monday .. 7 = Sunday) of the local time in the given timezone.
-- from is inclusive, to is exclusive; to < from is an overnight window that belongs to the day it starts on;
-- "24:00" is allowed as an end. from = to is an empty window.
--
-- Robustness contract:
--   * windows null / not an array / empty -> false; ts null -> false; tz null -> UTC;
--   * an unknown timezone raises invalid_parameter_value (a configuration bug must not read as "outside hours");
--   * malformed entries (non-object, missing or non-array days, days outside 1..7, bad HH:MM) never match and never raise.
CREATE FUNCTION itap.is_valid_timezone(tz text) RETURNS boolean
  LANGUAGE plpgsql STABLE
AS $$
BEGIN
  IF tz IS NULL THEN
    RETURN false;
  END IF;
  PERFORM now() AT TIME ZONE tz;
  RETURN true;
EXCEPTION WHEN invalid_parameter_value THEN
  RETURN false;
END;
$$;

CREATE FUNCTION itap.in_windows(windows jsonb, tz text, ts timestamptz) RETURNS boolean
  LANGUAGE plpgsql STABLE
AS $$
DECLARE
  local_ts timestamp;
  local_dow int;
  prev_dow int;
  local_time time;
  w jsonb;
  w_from time;
  w_to time;
  time_re constant text := '^([01]?[0-9]|2[0-3]):[0-5][0-9]$';
BEGIN
  IF windows IS NULL OR jsonb_typeof(windows) <> 'array' OR ts IS NULL THEN
    RETURN false;
  END IF;
  IF tz IS NULL THEN
    tz := 'UTC';
  END IF;
  local_ts := ts AT TIME ZONE tz; -- raises invalid_parameter_value for an unknown timezone
  local_dow := extract(isodow FROM local_ts)::int;
  prev_dow := CASE local_dow WHEN 1 THEN 7 ELSE local_dow - 1 END;
  local_time := local_ts::time;

  FOR w IN SELECT e FROM jsonb_array_elements(windows) AS e LOOP
    CONTINUE WHEN jsonb_typeof(w) <> 'object' OR jsonb_typeof(w -> 'days') IS DISTINCT FROM 'array';
    CONTINUE WHEN jsonb_typeof(w -> 'from') IS DISTINCT FROM 'string' OR jsonb_typeof(w -> 'to') IS DISTINCT FROM 'string';
    CONTINUE WHEN NOT ((w ->> 'from') ~ time_re AND ((w ->> 'to') ~ time_re OR (w ->> 'to') = '24:00'));
    w_from := (w ->> 'from')::time;
    w_to := (w ->> 'to')::time;
    IF w_from < w_to THEN
      IF (w -> 'days') @> to_jsonb(local_dow) AND local_time >= w_from AND local_time < w_to THEN
        RETURN true;
      END IF;
    ELSIF w_from > w_to THEN
      IF ((w -> 'days') @> to_jsonb(local_dow) AND local_time >= w_from)
         OR ((w -> 'days') @> to_jsonb(prev_dow) AND local_time < w_to) THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;
