-- Stage B abnormal_movement (spec §8.2, carry-over of slice 4; replaces the no-op of 1792365700021). Called by
-- itap.evaluate_detection for the detection's identity_locations row when it entered an area (signature, call site
-- and lock position unchanged: its dedup key is session-scoped, so only evaluations of the same session contend for
-- it, and they all take keys in the same order).
-- A transition = the location's area differs from the area of the previous location (with an area) of the same
-- session, ordered by occurred_at, id like the stats aggregation. Abnormal when, over the 30 facility-local days
-- before the detection's local day (area_transitions_daily; the current day is still being aggregated):
--   count(from -> to) <= organization_settings.abnormal_movement_max_count (default 1), and
--   outgoing transitions of from >= abnormal_movement_min_total (default 20) and incoming transitions of to >= it
--   (cold start: new areas or a new deployment emit nothing).
-- Event: abnormal_movement, severity medium, area = to area, dedup session:<id>:abnormal_movement:<to area>.
CREATE OR REPLACE FUNCTION itap.evaluate_abnormal_movement(p_location itap.identity_locations, p_base itap.events)
RETURNS SETOF uuid
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  prev_area uuid;
  tz text;
  local_day date;
  max_count integer;
  min_total integer;
  pair_count integer;
  from_total integer;
  to_total integer;
  from_name text;
  to_name text;
  ev itap.events;
BEGIN
  IF p_location.session_id IS NULL OR p_location.area_id IS NULL OR p_location.facility_id IS NULL THEN
    RETURN;
  END IF;
  SELECT l.area_id INTO prev_area FROM itap.identity_locations l
  WHERE l.organization_id = p_location.organization_id AND l.session_id = p_location.session_id
    AND l.area_id IS NOT NULL AND (l.occurred_at, l.id) < (p_location.occurred_at, p_location.id)
  ORDER BY l.occurred_at DESC, l.id DESC
  LIMIT 1;
  IF prev_area IS NULL OR prev_area = p_location.area_id THEN
    RETURN;
  END IF;
  SELECT st.abnormal_movement_max_count, st.abnormal_movement_min_total INTO max_count, min_total
  FROM itap.organization_settings st WHERE st.organization_id = p_location.organization_id;
  max_count := coalesce(max_count, 1);
  min_total := coalesce(min_total, 20);
  SELECT f.timezone INTO tz FROM itap.facilities f
  WHERE f.organization_id = p_location.organization_id AND f.id = p_location.facility_id;
  local_day := (p_location.occurred_at AT TIME ZONE coalesce(tz, 'UTC'))::date;
  SELECT coalesce(sum(t.count) FILTER (WHERE t.from_area_id = prev_area AND t.to_area_id = p_location.area_id), 0),
         coalesce(sum(t.count) FILTER (WHERE t.from_area_id = prev_area), 0),
         coalesce(sum(t.count) FILTER (WHERE t.to_area_id = p_location.area_id), 0)
  INTO pair_count, from_total, to_total
  FROM itap.area_transitions_daily t
  WHERE t.organization_id = p_location.organization_id AND t.facility_id = p_location.facility_id
    AND t.day >= local_day - 30 AND t.day < local_day
    AND (t.from_area_id = prev_area OR t.to_area_id = p_location.area_id);
  IF pair_count > max_count OR from_total < min_total OR to_total < min_total THEN
    RETURN;
  END IF;
  SELECT a.name INTO from_name FROM itap.areas a WHERE a.organization_id = p_location.organization_id AND a.id = prev_area;
  SELECT a.name INTO to_name FROM itap.areas a WHERE a.organization_id = p_location.organization_id AND a.id = p_location.area_id;
  ev := p_base;
  ev.area_id := p_location.area_id;
  ev.event_type := 'abnormal_movement';
  ev.severity := 'medium';
  ev.title := 'Unusual movement: ' || coalesce(from_name, '?') || ' -> ' || coalesce(to_name, '?');
  ev.payload := jsonb_build_object('from_area_id', prev_area, 'to_area_id', p_location.area_id,
                                   'transitions_30d', pair_count, 'from_area_total', from_total,
                                   'to_area_total', to_total);
  ev.dedup_key := 'session:' || p_location.session_id || ':abnormal_movement:' || p_location.area_id;
  RETURN NEXT itap.emit_event(ev);
END;
$$;
