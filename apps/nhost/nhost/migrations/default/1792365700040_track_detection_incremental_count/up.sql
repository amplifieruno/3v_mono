-- Stage A identity counters: detection_count is incremented by the detections since the last counter write instead
-- of recounting all of the identity's detections on every throttled write (O(history) per write). Everything else
-- as in the latest definition (1792365700029_bound_checked_in_visit_link).
CREATE OR REPLACE FUNCTION itap.track_detection()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  timeout_seconds integer;
  throttle_seconds integer;
  identity_profile uuid;
  identity_first timestamptz;
  identity_last timestamptz;
  sess itap.tracking_sessions%ROWTYPE;
  has_session boolean;
  latest_end timestamptz;
  opened boolean := false;
  wrote_location boolean;
  ap_direction text;
  movement text;
  linked_visit uuid;
BEGIN
  IF NEW.identity_id IS NULL OR NEW.facility_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT st.tracking_timeout_seconds, st.detection_counter_throttle_seconds INTO timeout_seconds, throttle_seconds
  FROM itap.organization_settings st WHERE st.organization_id = NEW.organization_id;
  timeout_seconds := coalesce(timeout_seconds, 300);
  throttle_seconds := coalesce(throttle_seconds, 10);

  -- 1. Identity counters, written at most once per throttle window of detected_at (spec §8.1); last_seen_at never
  --    decreases; an earlier detection always lowers first_seen_at. detection_count is incremental (no recount of
  --    the identity's history): a detection newer than last_seen_at but inside the throttle window is skipped and
  --    added by the next write, which counts the detections with detected_at in (last_seen_at, NEW.detected_at)
  --    (index range on (organization_id, identity_id, detected_at)) plus NEW itself. A detection at or before
  --    last_seen_at (late, or the same instant as the last write) is added at once, because a later range count
  --    could not tell it apart. Exact for one row per statement and for multi-row inserts in detected_at order per
  --    identity (rows of the same statement with a later detected_at are already visible, so the ranges stop
  --    before NEW). The first write counts NEW plus earlier detections never counted (e.g. ones without facility).
  SELECT i.profile_id, i.first_seen_at, i.last_seen_at INTO identity_profile, identity_first, identity_last
  FROM itap.identities i
  WHERE i.organization_id = NEW.organization_id AND i.id = NEW.identity_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF identity_last IS NULL THEN
    UPDATE itap.identities i
    SET last_seen_at = greatest(i.last_seen_at, NEW.detected_at),
        first_seen_at = least(i.first_seen_at, NEW.detected_at),
        detection_count = 1 + (
          SELECT count(*) FROM itap.detections d
          WHERE d.organization_id = NEW.organization_id AND d.identity_id = NEW.identity_id
            AND d.detected_at < NEW.detected_at
        )
    WHERE i.organization_id = NEW.organization_id AND i.id = NEW.identity_id;
  ELSIF NEW.detected_at <= identity_last THEN
    UPDATE itap.identities i
    SET first_seen_at = least(i.first_seen_at, NEW.detected_at),
        detection_count = i.detection_count + 1
    WHERE i.organization_id = NEW.organization_id AND i.id = NEW.identity_id;
  ELSIF NEW.detected_at >= identity_last + make_interval(secs => throttle_seconds) THEN
    UPDATE itap.identities i
    SET last_seen_at = greatest(i.last_seen_at, NEW.detected_at),
        first_seen_at = least(i.first_seen_at, NEW.detected_at),
        detection_count = i.detection_count + 1 + (
          SELECT count(*) FROM itap.detections d
          WHERE d.organization_id = NEW.organization_id AND d.identity_id = NEW.identity_id
            AND d.detected_at > identity_last AND d.detected_at < NEW.detected_at
        )
    WHERE i.organization_id = NEW.organization_id AND i.id = NEW.identity_id;
  END IF;

  -- 2. Session: extend, or close on timeout and open a new one; late detections stop here.
  SELECT * INTO sess FROM itap.tracking_sessions s
  WHERE s.organization_id = NEW.organization_id AND s.identity_id = NEW.identity_id
    AND s.facility_id = NEW.facility_id AND s.status = 'active';
  has_session := FOUND;
  IF has_session THEN
    IF NEW.detected_at < sess.last_detected_at THEN
      RETURN NULL;
    END IF;
    IF NEW.detected_at - sess.last_detected_at > make_interval(secs => timeout_seconds) THEN
      PERFORM itap.close_tracking_session(NEW.organization_id, sess.id);
      has_session := false;
    END IF;
  ELSE
    SELECT s.last_detected_at INTO latest_end FROM itap.tracking_sessions s
    WHERE s.organization_id = NEW.organization_id AND s.identity_id = NEW.identity_id AND s.facility_id = NEW.facility_id
    ORDER BY s.started_at DESC
    LIMIT 1;
    IF latest_end IS NOT NULL AND NEW.detected_at <= latest_end THEN
      RETURN NULL;
    END IF;
  END IF;
  IF NOT has_session THEN
    -- Visit of the visitor profile: a checked-in one (bounded as above) or one whose check-in/out interval
    -- contains the detection wins; else a scheduled one with detected_at in [expected_start - 2h, expected_end].
    -- A visit with a facility matches only that facility. Decided once, when the session opens.
    IF identity_profile IS NOT NULL THEN
      SELECT v.id INTO linked_visit FROM itap.visits v
      WHERE v.organization_id = NEW.organization_id AND v.visitor_profile_id = identity_profile
        AND (v.facility_id IS NULL OR v.facility_id = NEW.facility_id)
        AND (
          (v.status = 'checked_in' AND v.checked_in_at <= NEW.detected_at
           AND NEW.detected_at <= v.expected_end + interval '4 hours')
          OR (v.status = 'checked_out' AND v.checked_in_at <= NEW.detected_at AND v.checked_out_at >= NEW.detected_at)
          OR (v.status = 'scheduled' AND NEW.detected_at >= v.expected_start - interval '2 hours'
              AND NEW.detected_at <= v.expected_end)
        )
      ORDER BY (v.status <> 'scheduled') DESC, abs(extract(epoch FROM v.expected_start - NEW.detected_at)), v.id
      LIMIT 1;
    END IF;
    INSERT INTO itap.tracking_sessions
      (organization_id, identity_id, profile_id, facility_id, visit_id, status, started_at, last_detected_at,
       opened_by_detection_id)
    VALUES (NEW.organization_id, NEW.identity_id, identity_profile, NEW.facility_id, linked_visit, 'active',
            NEW.detected_at, NEW.detected_at, NEW.id)
    RETURNING * INTO sess;
    opened := true;
  END IF;

  -- 3. Location on area change or at an access point other than the one of the last written location (the first
  --    located detection of a session always counts).
  wrote_location := (NEW.area_id IS NOT NULL AND NEW.area_id IS DISTINCT FROM sess.last_area_id)
    OR (NEW.access_point_id IS NOT NULL AND NEW.access_point_id IS DISTINCT FROM sess.last_location_access_point_id);
  IF wrote_location THEN
    IF NEW.access_point_id IS NOT NULL THEN
      SELECT ap.direction INTO ap_direction FROM itap.access_points ap
      WHERE ap.organization_id = NEW.organization_id AND ap.id = NEW.access_point_id;
    END IF;
    movement := CASE
      WHEN ap_direction = 'out' THEN 'exit'
      WHEN ap_direction = 'in' OR opened THEN 'entry'
      ELSE 'movement'
    END;
    INSERT INTO itap.identity_locations
      (organization_id, identity_id, session_id, facility_id, area_id, access_point_id, device_id, detection_id,
       position, confidence, movement_type, occurred_at)
    SELECT NEW.organization_id, NEW.identity_id, sess.id, NEW.facility_id, NEW.area_id, NEW.access_point_id,
           NEW.device_id, NEW.id, d.position, NEW.confidence, movement, NEW.detected_at
    FROM (SELECT 1) one
    LEFT JOIN itap.devices d ON d.organization_id = NEW.organization_id AND d.id = NEW.device_id
    ON CONFLICT (organization_id, detection_id) DO NOTHING;
  END IF;

  -- Transition record on the session: last area / access point, visited areas, last detection time.
  UPDATE itap.tracking_sessions s
  SET last_detected_at = greatest(s.last_detected_at, NEW.detected_at),
      last_access_point_id = NEW.access_point_id,
      last_location_access_point_id = CASE WHEN wrote_location THEN NEW.access_point_id
                                           ELSE s.last_location_access_point_id END,
      last_area_id = coalesce(NEW.area_id, s.last_area_id),
      areas_visited = CASE
        WHEN NEW.area_id IS NULL OR NEW.area_id = ANY (s.areas_visited) THEN s.areas_visited
        ELSE s.areas_visited || NEW.area_id
      END
  WHERE s.organization_id = NEW.organization_id AND s.id = sess.id;

  -- Occupancy: one row per (facility, identity); entering another area (or a new session) resets entered_at.
  IF NEW.area_id IS NOT NULL THEN
    INSERT INTO itap.area_occupancy AS o
      (organization_id, facility_id, area_id, identity_id, session_id, entered_at, last_seen_at)
    VALUES (NEW.organization_id, NEW.facility_id, NEW.area_id, NEW.identity_id, sess.id, NEW.detected_at, NEW.detected_at)
    ON CONFLICT (organization_id, facility_id, identity_id) DO UPDATE
    SET entered_at = CASE WHEN o.area_id = EXCLUDED.area_id AND o.session_id IS NOT DISTINCT FROM EXCLUDED.session_id
                          THEN o.entered_at ELSE EXCLUDED.entered_at END,
        last_seen_at = CASE WHEN o.area_id = EXCLUDED.area_id AND o.session_id IS NOT DISTINCT FROM EXCLUDED.session_id
                            THEN greatest(o.last_seen_at, EXCLUDED.last_seen_at) ELSE EXCLUDED.last_seen_at END,
        area_id = EXCLUDED.area_id,
        session_id = EXCLUDED.session_id;
  ELSE
    UPDATE itap.area_occupancy o SET last_seen_at = greatest(o.last_seen_at, NEW.detected_at)
    WHERE o.organization_id = NEW.organization_id AND o.session_id = sess.id;
  END IF;
  RETURN NULL;
END;
$function$;
