-- Per-organization work of the tracking crons (spec §8.3), called by the backend handlers with the cron's
-- scheduled_time as p_at (never now()), so a retried run is a no-op. Admin secret only (tracked for no role).

-- close_stale_sessions (every 2 minutes): active sessions whose last detection is older than the organization's
-- tracking timeout at p_at (last_detected_at < p_at - timeout, the Stage A rule) are closed with
-- itap.close_tracking_session (completed at an entry/exit access point, else lost; occupancy cleared).
-- Locking: per identity, in identity id order, the same advisory lock Stage A takes in detections_derive
-- ('identity:' || id), before the session is touched; the staleness is re-checked under the lock, because a
-- detection committed meanwhile extends the session. Returns the sessions closed by this call.
CREATE FUNCTION itap.close_stale_sessions(p_organization uuid, p_at timestamptz) RETURNS SETOF itap.tracking_sessions
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  timeout_seconds integer;
  cutoff timestamptz;
  candidate record;
  closed uuid[] := '{}';
BEGIN
  SELECT st.tracking_timeout_seconds INTO timeout_seconds
  FROM itap.organization_settings st WHERE st.organization_id = p_organization;
  cutoff := p_at - make_interval(secs => coalesce(timeout_seconds, 300));
  FOR candidate IN
    SELECT s.id, s.identity_id FROM itap.tracking_sessions s
    WHERE s.organization_id = p_organization AND s.status = 'active' AND s.last_detected_at < cutoff
    ORDER BY s.identity_id, s.id
  LOOP
    IF candidate.identity_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('identity:' || candidate.identity_id::text, 0));
    END IF;
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM itap.tracking_sessions s
      WHERE s.organization_id = p_organization AND s.id = candidate.id AND s.status = 'active' AND s.last_detected_at < cutoff
    );
    IF itap.close_tracking_session(p_organization, candidate.id) IS NOT NULL THEN
      closed := closed || candidate.id;
    END IF;
  END LOOP;
  RETURN QUERY
    SELECT * FROM itap.tracking_sessions s WHERE s.organization_id = p_organization AND s.id = ANY (closed)
    ORDER BY s.identity_id, s.id;
END;
$$;
REVOKE ALL ON FUNCTION itap.close_stale_sessions(uuid, timestamptz) FROM PUBLIC;

-- evaluate_dwell_rules (every minute): time-based events from area_occupancy durations at p_at (spec §8.2).
-- The stay counts only as far as it was observed: the threshold must be reached by least(last_seen_at, p_at)
-- (occupancy rows live until the session times out, so a person who left keeps a row with an old last_seen_at).
-- * loitering: the occupant has been in an area with loitering_threshold_seconds for at least that long
--   (entered_at + threshold <= least(last_seen_at, p_at)); occurred_at = entered_at + threshold (the crossing,
--   independent of when the cron runs); base severity low, rules of type loitering in scope apply.
-- * unusual_dwell: per published unusual_dwell rule version in scope with parameters.dwell_seconds (a positive
--   number); occurred_at = entered_at + dwell_seconds; the version itself sets severity / incident.
-- Dedup per occupancy stint: occupancy:<occupancy id>:<type>:<area_id>:<entered_at epoch ms>[:<rule id>]. The
-- occupancy row lives for the session and is reused when the person moves, so area and entered_at identify the
-- stint; re-entering an area starts a new stint. Returns the events written by this call.
CREATE FUNCTION itap.evaluate_dwell_rules(p_organization uuid, p_at timestamptz) RETURNS SETOF itap.events
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  o record;
  ev itap.events;
  stint text;
  new_ids uuid[] := '{}';
BEGIN
  FOR o IN
    SELECT oc.*, a.name AS area_name, a.loitering_threshold_seconds AS threshold, s.profile_id
    FROM itap.area_occupancy oc
    JOIN itap.areas a ON a.organization_id = oc.organization_id AND a.id = oc.area_id
    LEFT JOIN itap.tracking_sessions s ON s.organization_id = oc.organization_id AND s.id = oc.session_id
    WHERE oc.organization_id = p_organization AND a.loitering_threshold_seconds IS NOT NULL
      AND oc.entered_at + make_interval(secs => a.loitering_threshold_seconds) <= least(oc.last_seen_at, p_at)
    ORDER BY oc.id
  LOOP
    stint := o.area_id || ':' || (extract(epoch FROM o.entered_at) * 1000)::bigint;
    ev := NULL;
    ev.organization_id := p_organization;
    ev.event_type := 'loitering';
    ev.severity := 'low';
    ev.facility_id := o.facility_id;
    ev.area_id := o.area_id;
    ev.identity_id := o.identity_id;
    ev.profile_id := o.profile_id;
    ev.session_id := o.session_id;
    ev.title := 'Loitering in ' || o.area_name;
    ev.payload := jsonb_build_object('threshold_seconds', o.threshold, 'entered_at', o.entered_at);
    ev.dedup_key := 'occupancy:' || o.id || ':loitering:' || stint;
    ev.occurred_at := o.entered_at + make_interval(secs => o.threshold);
    new_ids := new_ids || itap.emit_event(ev);
  END LOOP;

  FOR o IN
    SELECT x.* FROM (
      SELECT oc.*, a.name AS area_name, s.profile_id, m.version_id, m.rule_id,
             CASE WHEN jsonb_typeof(m.parameters -> 'dwell_seconds') = 'number'
                  THEN (m.parameters ->> 'dwell_seconds')::double precision END AS dwell_seconds
      FROM itap.area_occupancy oc
      JOIN itap.areas a ON a.organization_id = oc.organization_id AND a.id = oc.area_id
      LEFT JOIN itap.tracking_sessions s ON s.organization_id = oc.organization_id AND s.id = oc.session_id
      CROSS JOIN LATERAL itap.matching_rule_versions(oc.organization_id, 'unusual_dwell', oc.facility_id, oc.area_id) m
      WHERE oc.organization_id = p_organization
    ) x
    WHERE x.dwell_seconds > 0 AND x.entered_at + make_interval(secs => x.dwell_seconds) <= least(x.last_seen_at, p_at)
    ORDER BY x.id, x.rule_id
  LOOP
    stint := o.area_id || ':' || (extract(epoch FROM o.entered_at) * 1000)::bigint;
    ev := NULL;
    ev.organization_id := p_organization;
    ev.event_type := 'unusual_dwell';
    ev.severity := 'low';
    ev.facility_id := o.facility_id;
    ev.area_id := o.area_id;
    ev.identity_id := o.identity_id;
    ev.profile_id := o.profile_id;
    ev.session_id := o.session_id;
    ev.title := 'Unusually long stay in ' || o.area_name;
    ev.payload := jsonb_build_object('dwell_seconds', o.dwell_seconds, 'entered_at', o.entered_at);
    ev.dedup_key := 'occupancy:' || o.id || ':unusual_dwell:' || stint || ':' || o.rule_id;
    ev.occurred_at := o.entered_at + make_interval(secs => o.dwell_seconds);
    new_ids := new_ids || itap.emit_event(ev, o.version_id);
  END LOOP;

  new_ids := array_remove(new_ids, NULL);
  PERFORM itap.finish_events(p_organization, new_ids);
  RETURN QUERY
    SELECT * FROM itap.events e WHERE e.organization_id = p_organization AND e.id = ANY (new_ids)
    ORDER BY e.occurred_at, e.event_type;
END;
$$;
REVOKE ALL ON FUNCTION itap.evaluate_dwell_rules(uuid, timestamptz) FROM PUBLIC;
