-- Shared event writer of Stage B (evaluate_detection) and the dwell cron (spec §8.2): rule matching, severity,
-- idempotent insert, incidents, rule counters. Internal (not tracked).

-- Rule type that governs an event type (event_rule_types). NULL = no rule applies (detection_known/unknown, device
-- and platform events).
CREATE FUNCTION itap.event_rule_type(p_event_type text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_event_type
    WHEN 'after_hours' THEN 'after_hours'
    WHEN 'loitering' THEN 'loitering'
    WHEN 'unusual_dwell' THEN 'unusual_dwell'
    WHEN 'occupancy_exceeded' THEN 'occupancy'
    WHEN 'restricted_area_entry' THEN 'restricted_area'
    WHEN 'inactive_profile_detected' THEN 'inactive_profile'
    WHEN 'watchlist_match' THEN 'watchlist'
    WHEN 'blacklist_match' THEN 'watchlist'
    WHEN 'vip_arrival' THEN 'watchlist'
    WHEN 'tailgating' THEN 'tailgating'
    WHEN 'unexpected_facility' THEN 'unexpected_facility'
    WHEN 'abnormal_movement' THEN 'abnormal_movement'
  END;
$$;

-- Published versions of enabled rules of p_rule_type whose scope matches (spec §6.9): a version without scope rows
-- applies everywhere; otherwise one of its rows must match: facility_id = p_facility, or area_id = p_area or an
-- ancestor of it (areas.path). Segment scope rows never match until segments exist (slice 6), so a version scoped
-- only to segments applies nowhere. Ordered by severity (highest first), then rule number.
CREATE FUNCTION itap.matching_rule_versions(p_organization uuid, p_rule_type text, p_facility uuid, p_area uuid)
RETURNS TABLE (
  version_id uuid, rule_id uuid, rule_number bigint, rule_name text, severity text, parameters jsonb,
  creates_incident boolean, escalation_policy_id uuid
)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT v.id, r.id, r.number, r.name, v.severity, v.parameters, v.creates_incident, v.escalation_policy_id
  FROM itap.event_rules r
  JOIN itap.event_rule_versions v
    ON v.organization_id = r.organization_id AND v.id = r.current_version_id AND v.status = 'published'
  WHERE r.organization_id = p_organization AND r.rule_type = p_rule_type AND r.is_enabled
    AND (
      NOT EXISTS (
        SELECT 1 FROM itap.event_rule_version_scopes sc WHERE sc.organization_id = v.organization_id AND sc.version_id = v.id
      )
      OR EXISTS (
        SELECT 1
        FROM itap.event_rule_version_scopes sc
        LEFT JOIN itap.areas a ON a.organization_id = sc.organization_id AND a.id = p_area
        WHERE sc.organization_id = v.organization_id AND sc.version_id = v.id
          AND (sc.facility_id = p_facility OR (sc.area_id IS NOT NULL AND sc.area_id = ANY (a.path)))
      )
    )
  ORDER BY itap.severity_rank(v.severity) DESC, r.number;
$$;

-- Opens (or finds) the incident of a rule version for an event and links the event and its identity to it.
-- One incident per session and rule (incidents.dedup_key); a closed incident is terminal and gets no new links.
-- Severity, facility and area come from the event, the escalation policy from the version (spec §6.9).
CREATE FUNCTION itap.link_rule_incident(p_event itap.events, p_rule_id uuid, p_rule_name text, p_escalation_policy uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  v_key text := CASE WHEN p_event.session_id IS NOT NULL THEN 'session:' || p_event.session_id ELSE 'event:' || p_event.id END
    || ':rule:' || p_rule_id;
  v_incident uuid;
  v_status text;
BEGIN
  SELECT i.id, i.status INTO v_incident, v_status FROM itap.incidents i
  WHERE i.organization_id = p_event.organization_id AND i.dedup_key = v_key;
  IF NOT FOUND THEN
    INSERT INTO itap.incidents (organization_id, title, severity, facility_id, area_id, escalation_policy_id, dedup_key)
    VALUES (p_event.organization_id, left(p_rule_name || ': ' || p_event.title, 500), p_event.severity,
            p_event.facility_id, CASE WHEN p_event.facility_id IS NOT NULL THEN p_event.area_id END,
            p_escalation_policy, v_key)
    ON CONFLICT (organization_id, dedup_key) DO NOTHING
    RETURNING id, status INTO v_incident, v_status;
    IF v_incident IS NULL THEN
      SELECT i.id, i.status INTO v_incident, v_status FROM itap.incidents i
      WHERE i.organization_id = p_event.organization_id AND i.dedup_key = v_key;
    END IF;
  END IF;
  IF v_status = 'closed' THEN
    RETURN v_incident;
  END IF;
  INSERT INTO itap.incident_events (organization_id, incident_id, event_id)
  VALUES (p_event.organization_id, v_incident, p_event.id)
  ON CONFLICT (organization_id, incident_id, event_id) DO NOTHING;
  IF p_event.identity_id IS NOT NULL THEN
    INSERT INTO itap.incident_identities (organization_id, incident_id, identity_id, role)
    VALUES (p_event.organization_id, v_incident, p_event.identity_id, 'subject')
    ON CONFLICT (organization_id, incident_id, identity_id) DO NOTHING;
  END IF;
  RETURN v_incident;
END;
$$;

-- Writes one event: p_event carries organization, type, base severity, references, title, payload, dedup_key and
-- occurred_at (id / created_at are filled here). Rule versions in scope (or only p_version when given, e.g. the
-- unusual_dwell rule that produced the event) set rule_version_id (the first = highest severity) and the severity:
-- the highest matching rule severity replaces the base severity, except for watch list events, which keep the
-- severity of their list (spec §6.9: the list is the more specific configuration). All matched version ids are kept
-- in payload.rule_version_ids (rule counters). Idempotent: ON CONFLICT (organization_id, dedup_key) DO NOTHING; a
-- conflicting (already written) event returns NULL and creates no incident. Concurrent writers of one key serialize
-- on the unique index. Rule header counters are not touched here (see itap.bump_rule_counters).
CREATE FUNCTION itap.emit_event(p_event itap.events, p_version uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  ev itap.events := p_event;
  matched record;
  version_ids uuid[] := '{}';
  inserted uuid;
BEGIN
  ev.id := gen_random_uuid();
  ev.created_at := now();
  ev.payload := coalesce(ev.payload, '{}');
  ev.severity := coalesce(ev.severity, 'info');
  IF p_version IS NULL THEN
    SELECT coalesce(array_agg(m.version_id ORDER BY itap.severity_rank(m.severity) DESC, m.rule_number), '{}')
    INTO version_ids
    FROM itap.matching_rule_versions(ev.organization_id, itap.event_rule_type(ev.event_type), ev.facility_id, ev.area_id) m;
  ELSE
    SELECT coalesce(array_agg(v.id), '{}') INTO version_ids FROM itap.event_rule_versions v
    WHERE v.organization_id = ev.organization_id AND v.id = p_version;
  END IF;
  IF cardinality(version_ids) > 0 THEN
    ev.rule_version_id := version_ids[1];
    IF ev.event_type NOT IN ('watchlist_match', 'blacklist_match', 'vip_arrival') THEN
      SELECT v.severity INTO ev.severity FROM itap.event_rule_versions v
      WHERE v.organization_id = ev.organization_id AND v.id = version_ids[1];
    END IF;
    ev.payload := ev.payload || jsonb_build_object('rule_version_ids', to_jsonb(version_ids));
  END IF;

  INSERT INTO itap.events SELECT (ev).*
  ON CONFLICT (organization_id, dedup_key) DO NOTHING
  RETURNING id INTO inserted;
  IF inserted IS NULL THEN
    RETURN NULL;
  END IF;

  FOR matched IN
    SELECT r.id AS rule_id, r.name, v.escalation_policy_id
    FROM itap.event_rule_versions v
    JOIN itap.event_rules r ON r.organization_id = v.organization_id AND r.id = v.rule_id
    WHERE v.organization_id = ev.organization_id AND v.id = ANY (version_ids) AND v.creates_incident
    ORDER BY r.id
  LOOP
    PERFORM itap.link_rule_incident(ev, matched.rule_id, matched.name, matched.escalation_policy_id);
  END LOOP;
  RETURN inserted;
END;
$$;

-- Rule header counters (event_rules.trigger_count / last_triggered_at, not audited) for newly written events, one
-- UPDATE per rule in rule id order (a fixed lock order across concurrent Stage B transactions). Called once at the
-- end of each writer transaction.
CREATE FUNCTION itap.bump_rule_counters(p_organization uuid, p_events uuid[]) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  r record;
BEGIN
  IF p_events IS NULL OR cardinality(p_events) = 0 THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT v.rule_id, count(*)::integer AS hits, max(e.occurred_at) AS last_at
    FROM itap.events e
    CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(e.payload -> 'rule_version_ids', '[]')) AS x (version_id)
    JOIN itap.event_rule_versions v ON v.organization_id = e.organization_id AND v.id = x.version_id::uuid
    WHERE e.organization_id = p_organization AND e.id = ANY (p_events)
    GROUP BY v.rule_id
    ORDER BY v.rule_id
  LOOP
    UPDATE itap.event_rules er
    SET trigger_count = er.trigger_count + r.hits,
        last_triggered_at = greatest(er.last_triggered_at, r.last_at)
    WHERE er.organization_id = p_organization AND er.id = r.rule_id;
  END LOOP;
END;
$$;
