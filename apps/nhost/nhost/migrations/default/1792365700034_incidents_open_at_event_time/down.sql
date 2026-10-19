-- Restores incident creation at now() and the creation activity at now().
CREATE OR REPLACE FUNCTION itap.link_rule_incident(p_event itap.events, p_rule_id uuid, p_rule_name text, p_escalation_policy uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  v_key text := CASE
    WHEN p_event.event_type = 'occupancy_exceeded' AND p_event.payload ? 'bucket'
      THEN 'occupancy:' || p_event.area_id || ':rule:' || p_rule_id || ':' || (p_event.payload ->> 'bucket')
    WHEN p_event.session_id IS NOT NULL THEN 'session:' || p_event.session_id || ':rule:' || p_rule_id
    ELSE 'event:' || p_event.id || ':rule:' || p_rule_id
  END;
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

CREATE OR REPLACE FUNCTION itap.incident_activity_log() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  actor uuid := itap.session_member(NEW.organization_id);
  details jsonb;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    details := jsonb_build_object('from', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, 'to', NEW.status);
    IF NEW.status = 'resolved' THEN
      details := details || jsonb_build_object('disposition', NEW.disposition, 'resolution', NEW.resolution);
    END IF;
    INSERT INTO itap.incident_activities (organization_id, incident_id, actor_id, kind, details)
    VALUES (NEW.organization_id, NEW.id, actor, 'status_change', details);
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    INSERT INTO itap.incident_activities (organization_id, incident_id, actor_id, kind, details)
    VALUES (
      NEW.organization_id, NEW.id, actor, 'assigned',
      jsonb_build_object('from', CASE WHEN TG_OP = 'UPDATE' THEN OLD.assigned_to END, 'to', NEW.assigned_to)
    );
  END IF;
  RETURN NULL;
END;
$$;
