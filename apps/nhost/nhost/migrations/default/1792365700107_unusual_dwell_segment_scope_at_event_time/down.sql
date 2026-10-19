-- Restores the 7-argument matching_rule_versions and evaluate_dwell_rules of *_event_rule_segment_scopes.
DROP FUNCTION itap.matching_rule_versions(uuid, text, uuid, uuid, uuid, uuid, timestamptz, boolean);
CREATE FUNCTION itap.matching_rule_versions(p_organization uuid, p_rule_type text, p_facility uuid, p_area uuid, p_identity uuid DEFAULT NULL::uuid, p_profile uuid DEFAULT NULL::uuid, p_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(version_id uuid, rule_id uuid, rule_number bigint, rule_name text, severity text, parameters jsonb, creates_incident boolean, escalation_policy_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
  SELECT v.id, r.id, r.number, r.name, v.severity, v.parameters, v.creates_incident, v.escalation_policy_id
  FROM itap.event_rules r
  JOIN itap.event_rule_versions v
    ON v.organization_id = r.organization_id AND v.id = r.current_version_id AND v.status = 'published'
  WHERE r.organization_id = p_organization AND r.rule_type = p_rule_type AND r.is_enabled
    AND (
      NOT EXISTS (
        SELECT 1 FROM itap.event_rule_version_scopes sc
        WHERE sc.organization_id = v.organization_id AND sc.version_id = v.id AND sc.segment_id IS NULL
      )
      OR EXISTS (
        SELECT 1
        FROM itap.event_rule_version_scopes sc
        LEFT JOIN itap.areas a ON a.organization_id = sc.organization_id AND a.id = p_area
        WHERE sc.organization_id = v.organization_id AND sc.version_id = v.id
          AND (sc.facility_id = p_facility OR (sc.area_id IS NOT NULL AND sc.area_id = ANY (a.path)))
      )
    )
    AND (
      NOT EXISTS (
        SELECT 1 FROM itap.event_rule_version_scopes sc
        WHERE sc.organization_id = v.organization_id AND sc.version_id = v.id AND sc.segment_id IS NOT NULL
      )
      OR EXISTS (
        SELECT 1 FROM itap.event_rule_version_scopes sc
        WHERE sc.organization_id = v.organization_id AND sc.version_id = v.id AND sc.segment_id IS NOT NULL
          AND itap.subject_in_segment(p_organization, sc.segment_id, p_identity, p_profile, p_at)
      )
    )
  ORDER BY itap.severity_rank(v.severity) DESC, r.number;
$function$;

CREATE OR REPLACE FUNCTION itap.evaluate_dwell_rules(p_organization uuid, p_at timestamp with time zone)
 RETURNS SETOF itap.events
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
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
      CROSS JOIN LATERAL itap.matching_rule_versions(
        oc.organization_id, 'unusual_dwell', oc.facility_id, oc.area_id, oc.identity_id, s.profile_id, least(oc.last_seen_at, p_at)
      ) m
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
$function$;

DROP FUNCTION itap.rule_version_segment_scopes_match(uuid, uuid, uuid, uuid, timestamptz);
