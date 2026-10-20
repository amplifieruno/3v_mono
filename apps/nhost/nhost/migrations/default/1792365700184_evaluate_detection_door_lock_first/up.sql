-- Slice 8 final review: evaluate_detection takes the access point advisory lock first for every detection with an
-- access point (not only at face-credential doors); evaluate_tailgating re-takes it (re-entrant).
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

    -- Door lock first, for every detection at an access point and before anything is written (lock order: door lock
    -- -> grant row -> event keys -> incident counter -> rule rows). Serialises Stage B per door: redelivery, the
    -- cooldown and the tailgating counts see earlier decisions, and toggling face_credential cannot invert the order.
    IF d.access_point_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('access_point:' || d.access_point_id::text, 0));
      SELECT * INTO door FROM itap.access_points a WHERE a.organization_id = d.organization_id AND a.id = d.access_point_id;
      IF FOUND AND door.face_credential THEN
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
