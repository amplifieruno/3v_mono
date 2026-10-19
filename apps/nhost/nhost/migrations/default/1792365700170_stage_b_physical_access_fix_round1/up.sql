-- Stage B physical access, plan-08 task 3 fix round 1 (latest definitions from 1792365700167_stage_b_physical_access):
-- * evaluate_tailgating takes the door advisory lock ('access_point:<id>') at every door and emits nothing when a
--   tailgating event at the door already lies within +-window of the detection (no double events for one case across
--   a bucket boundary, on redelivery or out-of-order / concurrent evaluation);
-- * tailgating condition: granted >= 1 AND people > granted (two denied faces are not tailgating);
-- * the face decision event carries the session (Stage B's, else the identity's session covering the detection time):
--   evaluate_face_credential gains p_session.
-- Lock order unchanged: door lock -> grant row -> event keys -> finish_events. At a door without face credential the
-- door lock is taken after the decision-free event keys; no writer holding it waits for one of those keys (the
-- tailgating key is only written under the lock).
DROP FUNCTION itap.evaluate_face_credential(itap.detections, itap.access_points);

CREATE FUNCTION itap.evaluate_face_credential(p_detection itap.detections, p_door itap.access_points, p_session uuid)
RETURNS uuid
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  d itap.detections := p_detection;
  ident uuid;
  prof uuid;
  cooldown interval;
  res itap.access_evaluation;
  session_id uuid := p_session;
  event_id uuid;
BEGIN
  -- Caller holds the door lock. Redelivery of the same detection: nothing new.
  IF EXISTS (SELECT 1 FROM itap.access_decisions x WHERE x.detection_id = d.id) THEN
    RETURN NULL;
  END IF;
  ident := itap.effective_identity(d.organization_id, d.identity_id);
  SELECT i.profile_id INTO prof FROM itap.identities i WHERE i.organization_id = d.organization_id AND i.id = ident;
  SELECT make_interval(secs => s.face_credential_cooldown_seconds) INTO cooldown
  FROM itap.organization_settings s WHERE s.organization_id = d.organization_id;
  cooldown := coalesce(cooldown, interval '10 seconds');
  IF EXISTS (
    SELECT 1 FROM itap.access_decisions x
    WHERE x.organization_id = d.organization_id AND x.access_point_id = p_door.id
      AND x.decided_at > d.detected_at - cooldown AND x.decided_at < d.detected_at + cooldown
      AND CASE WHEN prof IS NOT NULL THEN x.profile_id = prof ELSE x.identity_id = ident END
  ) THEN
    RETURN NULL;
  END IF;
  -- The session of the detection: Stage B's (opened or location row), else the identity's session in the facility
  -- that covers the detection time (a frame that changes no tracking state).
  IF session_id IS NULL THEN
    SELECT s.id INTO session_id FROM itap.tracking_sessions s
    WHERE s.organization_id = d.organization_id AND s.identity_id = d.identity_id AND s.facility_id = d.facility_id
      AND s.started_at <= d.detected_at AND s.last_detected_at >= d.detected_at
    ORDER BY s.started_at DESC LIMIT 1;
  END IF;
  res := itap.evaluate_access(d.organization_id, p_door.id, d.identity_id, NULL, d.device_id, d.detected_at, true,
                              NULL, d.id, false, session_id);
  SELECT e.id INTO event_id FROM itap.events e
  WHERE e.organization_id = d.organization_id AND e.dedup_key = 'decision:' || res.decision_id;
  RETURN event_id;
END;
$$;
REVOKE ALL ON FUNCTION itap.evaluate_face_credential(itap.detections, itap.access_points, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION itap.evaluate_tailgating(p_detection itap.detections, p_base itap.events)
RETURNS SETOF uuid
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  d itap.detections := p_detection;
  door itap.access_points;
  win integer;
  range_from timestamptz;
  range_to timestamptz;
  decisions integer;
  granted integer;
  people integer;
  ev itap.events;
  inserted uuid;
BEGIN
  SELECT * INTO door FROM itap.access_points a WHERE a.organization_id = d.organization_id AND a.id = d.access_point_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  -- Serialises tailgating per door (every door; Stage B already holds it at face-credential doors): concurrent,
  -- redelivered and out-of-order evaluations see each other's events.
  PERFORM pg_advisory_xact_lock(hashtextextended('access_point:' || door.id::text, 0));
  SELECT s.tailgating_window_seconds INTO win FROM itap.organization_settings s WHERE s.organization_id = d.organization_id;
  win := coalesce(win, 5);
  range_from := d.detected_at - make_interval(secs => win);
  range_to := d.detected_at + make_interval(secs => win);
  SELECT count(*), count(*) FILTER (WHERE x.result = 'granted') INTO decisions, granted
  FROM itap.access_decisions x
  WHERE x.organization_id = d.organization_id AND x.access_point_id = door.id
    AND x.decided_at >= range_from AND x.decided_at <= range_to;
  IF door.face_credential THEN
    SELECT count(DISTINCT coalesce(x.profile_id, x.identity_id)) INTO people
    FROM itap.access_decisions x
    WHERE x.organization_id = d.organization_id AND x.access_point_id = door.id
      AND x.decided_at >= range_from AND x.decided_at <= range_to
      AND coalesce(x.profile_id, x.identity_id) IS NOT NULL;
  ELSIF decisions > 0 THEN
    SELECT count(DISTINCT itap.effective_identity(d.organization_id, x.identity_id)) INTO people
    FROM itap.detections x
    WHERE x.organization_id = d.organization_id AND x.access_point_id = door.id
      AND x.detected_at >= range_from AND x.detected_at <= range_to AND x.identity_id IS NOT NULL;
  ELSE
    RETURN;
  END IF;
  -- Someone was let in and more people than granted passed: two denied faces opened nothing (access_denied covers them).
  IF granted < 1 OR people <= granted THEN
    RETURN;
  END IF;
  -- One case, one event: none when a tailgating event at this door lies within the window of this detection (the bucket
  -- key alone splits a case straddling a bucket boundary).
  IF EXISTS (
    SELECT 1 FROM itap.events e
    WHERE e.organization_id = d.organization_id AND e.event_type = 'tailgating' AND e.access_point_id = door.id
      AND e.occurred_at >= range_from AND e.occurred_at <= range_to
  ) THEN
    RETURN;
  END IF;
  ev := p_base;
  ev.area_id := door.area_id;
  ev.access_point_id := door.id;
  ev.event_type := 'tailgating';
  ev.severity := 'high';
  ev.title := 'Tailgating at ' || door.name;
  ev.payload := jsonb_build_object('people', people, 'granted', granted, 'decisions', decisions,
                                   'window_seconds', win,
                                   'counted_from', CASE WHEN door.face_credential THEN 'decisions' ELSE 'detections' END,
                                   'bucket', floor(extract(epoch FROM d.detected_at) / win)::bigint);
  ev.dedup_key := 'ap:' || door.id || ':tailgating:' || (ev.payload ->> 'bucket');
  inserted := itap.emit_event(ev);
  IF inserted IS NOT NULL THEN
    RETURN NEXT inserted;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION itap.evaluate_detection(p_detection uuid)
 RETURNS SETOF itap.events
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  d itap.detections;
  sess itap.tracking_sessions;
  loc itap.identity_locations;
  fac itap.facilities;
  prof itap.profiles;
  has_session boolean := false;
  has_profile boolean := false;
  base itap.events;
  ev itap.events;
  list record;
  area_row itap.areas;
  top_level text;
  clearance_rank integer;
  occupied integer;
  door itap.access_points;
  area_allowed boolean;
  new_ids uuid[] := '{}';
BEGIN
  -- A detection whose organization is deleted while it is evaluated (FK violation on an event/incident insert:
  -- the organization or detection is gone) is a no-op success, so the event trigger does not retry it.
  BEGIN
    SELECT * INTO d FROM itap.detections WHERE id = p_detection;
    IF NOT FOUND OR d.identity_id IS NULL OR d.facility_id IS NULL THEN
      RETURN;
    END IF;
    base.organization_id := d.organization_id;
    base.facility_id := d.facility_id;
    base.area_id := d.area_id;
    base.access_point_id := d.access_point_id;
    base.device_id := d.device_id;
    base.identity_id := d.identity_id;
    base.detection_id := d.id;
    base.occurred_at := d.detected_at;
    base.payload := '{}';

    SELECT * INTO loc FROM itap.identity_locations l WHERE l.organization_id = d.organization_id AND l.detection_id = d.id;
    SELECT * INTO sess FROM itap.tracking_sessions s
    WHERE s.organization_id = d.organization_id
      AND (s.opened_by_detection_id = d.id OR s.id = loc.session_id)
    ORDER BY (s.opened_by_detection_id IS NOT DISTINCT FROM d.id) DESC
    LIMIT 1;
    has_session := FOUND;
    IF has_session THEN
      base.session_id := sess.id;
      base.profile_id := sess.profile_id;
      SELECT * INTO prof FROM itap.profiles p WHERE p.organization_id = d.organization_id AND p.id = sess.profile_id;
      has_profile := FOUND;
    END IF;

    -- Access point with face credential: the decision comes first (lock order: door lock -> grant row -> event keys).
    IF d.access_point_id IS NOT NULL THEN
      SELECT * INTO door FROM itap.access_points a WHERE a.organization_id = d.organization_id AND a.id = d.access_point_id;
      IF FOUND AND door.face_credential THEN
        -- Serialises Stage B per door: redelivery, the cooldown and the tailgating counts see earlier decisions.
        PERFORM pg_advisory_xact_lock(hashtextextended('access_point:' || door.id::text, 0));
        new_ids := new_ids || itap.evaluate_face_credential(d, door, CASE WHEN has_session THEN sess.id END);
      END IF;
    END IF;

    -- Session opened.
    IF has_session AND sess.opened_by_detection_id IS NOT DISTINCT FROM d.id THEN
      ev := base;
      ev.event_type := CASE WHEN has_profile THEN 'detection_known' ELSE 'detection_unknown' END;
      ev.severity := 'info';
      ev.title := CASE WHEN has_profile THEN 'Known person detected' ELSE 'Unknown person detected' END;
      ev.dedup_key := 'session:' || sess.id || ':' || ev.event_type;
      new_ids := new_ids || itap.emit_event(ev);

      FOR list IN
        SELECT l.id, l.name, l.kind, l.severity FROM itap.identity_watch_lists(d.organization_id, d.identity_id, d.detected_at) l
        ORDER BY l.id
      LOOP
        ev := base;
        ev.event_type := CASE list.kind WHEN 'blacklist' THEN 'blacklist_match' WHEN 'vip' THEN 'vip_arrival'
                                        ELSE 'watchlist_match' END;
        ev.severity := list.severity;
        ev.title := CASE list.kind WHEN 'blacklist' THEN 'Blacklist match' WHEN 'vip' THEN 'VIP arrival'
                                   ELSE 'Watch list match' END || ': ' || list.name;
        ev.payload := jsonb_build_object('watch_list_id', list.id, 'watch_list_name', list.name, 'watch_list_kind', list.kind);
        ev.dedup_key := 'session:' || sess.id || ':' || ev.event_type || ':' || list.id;
        new_ids := new_ids || itap.emit_event(ev);
      END LOOP;

      IF has_profile AND prof.status IN ('suspended', 'terminated') THEN
        ev := base;
        ev.event_type := 'inactive_profile_detected';
        ev.severity := 'medium';
        ev.title := 'Inactive profile detected (' || prof.status || ')';
        ev.payload := jsonb_build_object('profile_status', prof.status);
        ev.dedup_key := 'session:' || sess.id || ':' || ev.event_type;
        new_ids := new_ids || itap.emit_event(ev);
      END IF;

      IF has_profile AND NOT EXISTS (
        SELECT 1 FROM itap.tracking_sessions s
        WHERE s.organization_id = d.organization_id AND s.profile_id = sess.profile_id AND s.facility_id = sess.facility_id
          AND s.id <> sess.id AND s.started_at <= sess.started_at
      ) THEN
        ev := base;
        ev.event_type := 'unexpected_facility';
        ev.severity := 'low';
        ev.title := 'First visit to this facility';
        ev.dedup_key := 'session:' || sess.id || ':' || ev.event_type;
        new_ids := new_ids || itap.emit_event(ev);
      END IF;

      SELECT * INTO fac FROM itap.facilities f WHERE f.organization_id = d.organization_id AND f.id = d.facility_id;
      IF jsonb_array_length(fac.operating_hours) > 0 AND NOT itap.in_windows(fac.operating_hours, fac.timezone, d.detected_at)
         AND NOT (has_profile AND itap.profile_rostered_at(prof, d.detected_at)) THEN
        ev := base;
        ev.event_type := 'after_hours';
        ev.severity := 'medium';
        ev.title := 'Presence outside operating hours';
        ev.payload := jsonb_build_object('timezone', fac.timezone);
        ev.dedup_key := 'session:' || sess.id || ':' || ev.event_type;
        new_ids := new_ids || itap.emit_event(ev);
      END IF;
    END IF;

    -- Area entered.
    IF has_session AND loc.id IS NOT NULL AND loc.area_id IS NOT NULL THEN
      base.area_id := loc.area_id;
      -- Policy-based authorization where an enforced version or a grant governs the area, else the access ranks.
      area_allowed := itap.area_access_allowed(d.organization_id, loc.area_id, d.identity_id, sess.profile_id, d.detected_at);
      IF area_allowed IS NOT NULL THEN
        IF NOT area_allowed THEN
          ev := base;
          ev.event_type := 'restricted_area_entry';
          ev.severity := 'high';
          ev.title := 'Entry into an area without authorization';
          ev.payload := jsonb_build_object('basis', 'policy',
                                           'profile_type', CASE WHEN has_profile THEN prof.profile_type END,
                                           'clearance', CASE WHEN has_profile THEN prof.access_level END);
          ev.dedup_key := 'session:' || sess.id || ':' || ev.event_type || ':' || loc.area_id;
          new_ids := new_ids || itap.emit_event(ev);
        END IF;
      ELSE
        SELECT p.access_level INTO top_level
        FROM itap.areas a
        JOIN itap.areas p ON p.organization_id = a.organization_id AND p.id = ANY (a.path)
        WHERE a.organization_id = d.organization_id AND a.id = loc.area_id
        ORDER BY itap.access_rank(p.access_level) DESC
        LIMIT 1;
        clearance_rank := CASE WHEN has_profile THEN itap.access_rank(prof.access_level) ELSE 1 END;
        IF itap.access_rank(top_level) > clearance_rank THEN
          ev := base;
          ev.event_type := 'restricted_area_entry';
          ev.severity := 'high';
          ev.title := 'Entry into a ' || top_level || ' area';
          ev.payload := jsonb_build_object('basis', 'rank', 'area_access_level', top_level,
                                           'clearance', CASE WHEN has_profile THEN prof.access_level END);
          ev.dedup_key := 'session:' || sess.id || ':' || ev.event_type || ':' || loc.area_id;
          new_ids := new_ids || itap.emit_event(ev);
        END IF;
      END IF;

      FOR area_row IN
        SELECT p.* FROM itap.areas a
        JOIN itap.areas p ON p.organization_id = a.organization_id AND p.id = ANY (a.path)
        WHERE a.organization_id = d.organization_id AND a.id = loc.area_id AND p.capacity IS NOT NULL
        ORDER BY p.depth DESC, p.id
      LOOP
        occupied := itap.area_current_occupancy(area_row);
        IF occupied > area_row.capacity THEN
          ev := base;
          ev.area_id := area_row.id;
          ev.event_type := 'occupancy_exceeded';
          ev.severity := 'medium';
          ev.title := 'Occupancy above capacity: ' || area_row.name;
          ev.payload := jsonb_build_object('capacity', area_row.capacity, 'occupancy', occupied,
                                           'bucket', floor(extract(epoch FROM d.detected_at) / 900)::bigint);
          ev.dedup_key := 'occupancy:' || area_row.id || ':occupancy_exceeded:' || (ev.payload ->> 'bucket');
          new_ids := new_ids || itap.emit_event(ev);
        END IF;
      END LOOP;

      new_ids := new_ids || ARRAY(SELECT itap.evaluate_abnormal_movement(loc, base));
    END IF;

    -- Access point passed (every detection at a door, with or without a tracking state change).
    IF d.access_point_id IS NOT NULL THEN
      new_ids := new_ids || ARRAY(SELECT itap.evaluate_tailgating(d, base));
    END IF;

    PERFORM itap.finish_events(d.organization_id, array_remove(new_ids, NULL));
    RETURN QUERY
      SELECT * FROM itap.events e WHERE e.organization_id = d.organization_id AND e.detection_id = d.id
      ORDER BY e.occurred_at, e.event_type;
  EXCEPTION WHEN foreign_key_violation THEN
    IF NOT EXISTS (SELECT 1 FROM itap.detections WHERE id = p_detection) THEN
      RETURN;
    END IF;
    RAISE;
  END;
END;
$function$;
