-- Notification helpers (slice 5 task 2): the one template renderer and the end of a quiet-hours window.

-- Replaces every {{ name }} placeholder (lowercase, digits, _ and ., spaces allowed inside the braces; the shape
-- enforced by notification_templates_placeholders_valid) with p_vars ->> name (flat key such as "event_title" or
-- "x.y"), else the nested path p_vars #>> {x, y}; unknown names render as ''. Single pass: a substituted value is
-- never expanded again. NULL body -> NULL.
CREATE FUNCTION itap.render_template(p_body text, p_vars jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
DECLARE
  pattern constant text := '\{\{\s*([a-z_][a-z0-9_.]*)\s*\}\}';
  parts text[];
  names text[];
  result text;
  i integer;
BEGIN
  IF p_body IS NULL THEN
    RETURN NULL;
  END IF;
  parts := regexp_split_to_array(p_body, pattern);
  SELECT coalesce(array_agg(m.match[1] ORDER BY m.n), '{}') INTO names
  FROM regexp_matches(p_body, pattern, 'g') WITH ORDINALITY AS m (match, n);
  result := parts[1];
  FOR i IN 1 .. cardinality(names) LOOP
    result := result
      || coalesce(p_vars ->> names[i], p_vars #>> string_to_array(names[i], '.'), '')
      || parts[i + 1];
  END LOOP;
  RETURN result;
END;
$$;

-- The first instant >= p_ts that is outside p_windows (itap.in_windows in timezone p_tz): p_ts itself when it is not
-- inside; otherwise the earliest window end (a window `to` on one of the next days, local time) that is not inside
-- another window (adjacent or overlapping windows chain). NULL when no such instant exists within 8 days (windows
-- covering the whole week): the caller then does not defer.
CREATE FUNCTION itap.windows_end(p_windows jsonb, p_tz text, p_ts timestamptz) RETURNS timestamptz
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  tz constant text := coalesce(p_tz, 'UTC');
  local_date date;
  candidate timestamptz;
BEGIN
  IF NOT itap.in_windows(p_windows, tz, p_ts) THEN
    RETURN p_ts;
  END IF;
  local_date := (p_ts AT TIME ZONE tz)::date;
  FOR candidate IN
    SELECT DISTINCT ((local_date + d.n) + CASE WHEN w ->> 'to' = '24:00' THEN interval '24 hours'
                                               ELSE (w ->> 'to')::time::interval END) AT TIME ZONE tz AS c
    FROM jsonb_array_elements(p_windows) AS w
    CROSS JOIN generate_series(0, 8) AS d (n)
    WHERE jsonb_typeof(w) = 'object' AND jsonb_typeof(w -> 'to') = 'string'
      AND ((w ->> 'to') ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' OR w ->> 'to' = '24:00')
    ORDER BY 1
  LOOP
    CONTINUE WHEN candidate <= p_ts;
    IF NOT itap.in_windows(p_windows, tz, candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
