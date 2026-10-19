-- Incident mutations (spec §8.1), tracked for org_admin, session organization only (a foreign id raises
-- incident_not_found). Status changes are logged by incident_activity_log with the session member as actor;
-- transitions are validated by incidents_validate_transition.
--   acknowledge_incident(incident)                       open -> acknowledged (idempotent when acknowledged)
--   start_investigation(incident)                        open | acknowledged | resolved (reopen) -> investigating
--   resolve_incident(incident, disposition, resolution)  open | acknowledged | investigating -> resolved
--   close_incident(incident)                             resolved -> closed (terminal)
--   escalate_incident(incident, reason)                  manual escalation: escalation_step + 1, last_escalated_at,
--                                                        activity `escalated` (deliveries: slice 5)
-- Investigating or resolving an unacknowledged incident acknowledges it implicitly (stops escalation).

-- Locks the incident of the session organization (raises incident_not_found).
CREATE FUNCTION itap.lock_incident(p_organization_id uuid, p_incident uuid) RETURNS itap.incidents
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  incident itap.incidents;
BEGIN
  SELECT * INTO incident FROM itap.incidents WHERE organization_id = p_organization_id AND id = p_incident FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('incident_not_found');
  END IF;
  RETURN incident;
END;
$$;

CREATE FUNCTION itap.acknowledge_incident(hasura_session json, p_incident uuid)
RETURNS SETOF itap.incidents
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  incident itap.incidents := itap.lock_incident(org, p_incident);
BEGIN
  IF incident.status <> 'acknowledged' THEN
    IF incident.status <> 'open' THEN
      PERFORM itap.raise_code('incident_invalid_transition');
    END IF;
    UPDATE itap.incidents
    SET status = 'acknowledged', acknowledged_at = now(),
        acknowledged_by = itap.organization_member(org, itap.session_user_id(hasura_session))
    WHERE organization_id = org AND id = p_incident;
  END IF;
  RETURN QUERY SELECT * FROM itap.incidents WHERE organization_id = org AND id = p_incident;
END;
$$;

CREATE FUNCTION itap.start_investigation(hasura_session json, p_incident uuid)
RETURNS SETOF itap.incidents
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.organization_member(org, itap.session_user_id(hasura_session));
  incident itap.incidents := itap.lock_incident(org, p_incident);
BEGIN
  IF NOT itap.incident_transition_allowed(incident.status, 'investigating') THEN
    PERFORM itap.raise_code('incident_invalid_transition');
  END IF;
  -- Reopening a resolved incident clears its resolution (kept in the activity timeline).
  UPDATE itap.incidents
  SET status = 'investigating',
      acknowledged_at = coalesce(acknowledged_at, now()),
      acknowledged_by = CASE WHEN acknowledged_at IS NULL THEN actor ELSE acknowledged_by END,
      disposition = NULL, resolution = NULL, resolved_at = NULL, resolved_by = NULL
  WHERE organization_id = org AND id = p_incident;
  RETURN QUERY SELECT * FROM itap.incidents WHERE organization_id = org AND id = p_incident;
END;
$$;

CREATE FUNCTION itap.resolve_incident(
  hasura_session json,
  p_incident uuid,
  p_disposition text,
  p_resolution text DEFAULT NULL
)
RETURNS SETOF itap.incidents
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.organization_member(org, itap.session_user_id(hasura_session));
  incident itap.incidents := itap.lock_incident(org, p_incident);
BEGIN
  IF NOT itap.incident_transition_allowed(incident.status, 'resolved') THEN
    PERFORM itap.raise_code('incident_invalid_transition');
  END IF;
  IF p_disposition IS NULL THEN
    PERFORM itap.raise_code('incident_disposition_required');
  END IF;
  UPDATE itap.incidents
  SET status = 'resolved', disposition = p_disposition, resolution = p_resolution,
      resolved_at = now(), resolved_by = actor,
      acknowledged_at = coalesce(acknowledged_at, now()),
      acknowledged_by = CASE WHEN acknowledged_at IS NULL THEN actor ELSE acknowledged_by END
  WHERE organization_id = org AND id = p_incident;
  RETURN QUERY SELECT * FROM itap.incidents WHERE organization_id = org AND id = p_incident;
END;
$$;

CREATE FUNCTION itap.close_incident(hasura_session json, p_incident uuid)
RETURNS SETOF itap.incidents
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  incident itap.incidents := itap.lock_incident(org, p_incident);
BEGIN
  IF incident.status <> 'resolved' THEN
    PERFORM itap.raise_code('incident_invalid_transition');
  END IF;
  UPDATE itap.incidents SET status = 'closed' WHERE organization_id = org AND id = p_incident;
  RETURN QUERY SELECT * FROM itap.incidents WHERE organization_id = org AND id = p_incident;
END;
$$;

CREATE FUNCTION itap.escalate_incident(hasura_session json, p_incident uuid, p_reason text DEFAULT NULL)
RETURNS SETOF itap.incidents
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  incident itap.incidents := itap.lock_incident(org, p_incident);
BEGIN
  IF incident.status IN ('resolved', 'closed') THEN
    PERFORM itap.raise_code('incident_not_active');
  END IF;
  UPDATE itap.incidents
  SET escalation_step = escalation_step + 1, last_escalated_at = now()
  WHERE organization_id = org AND id = p_incident
  RETURNING * INTO incident;
  INSERT INTO itap.incident_activities (organization_id, incident_id, actor_id, kind, details)
  VALUES (
    org, p_incident, itap.organization_member(org, itap.session_user_id(hasura_session)), 'escalated',
    jsonb_build_object('step', incident.escalation_step, 'manual', true, 'reason', p_reason)
  );
  RETURN NEXT incident;
END;
$$;
