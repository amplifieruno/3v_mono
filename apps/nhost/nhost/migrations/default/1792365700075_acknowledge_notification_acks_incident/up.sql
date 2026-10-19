-- Final review fix 6: acknowledging an escalation page acknowledges its incident (the operator answered the page, so
-- the escalation stops). Only when the inbox row came from an escalation delivery (escalation_step_id) and its incident
-- is still open and unacknowledged; the incident goes through acknowledge_incident (same transition, activity and
-- audit; acknowledged_by = the caller). Rule and subscription notifications never touch the incident, and an incident
-- acknowledged, resolved or closed meanwhile is left as it is (the page is acknowledged either way).
-- Lock order: the incident row first (as acknowledge_incident and the escalate cron), then the inbox row and its
-- delivery (the ack trigger).
CREATE OR REPLACE FUNCTION itap.acknowledge_notification(hasura_session json, p_notification uuid)
 RETURNS SETOF itap.user_notifications
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  me uuid := itap.session_user_id(hasura_session);
  page_incident uuid;
  inc itap.incidents;
BEGIN
  SELECT n.incident_id INTO page_incident
  FROM itap.user_notifications n
  JOIN itap.notification_deliveries d ON d.organization_id = n.organization_id AND d.id = n.delivery_id
  WHERE n.organization_id = org AND n.id = p_notification AND n.user_id = me
    AND d.escalation_step_id IS NOT NULL AND n.incident_id IS NOT NULL AND n.acknowledged_at IS NULL;
  IF page_incident IS NOT NULL THEN
    SELECT * INTO inc FROM itap.incidents i WHERE i.organization_id = org AND i.id = page_incident FOR UPDATE;
    IF FOUND AND inc.status = 'open' AND inc.acknowledged_at IS NULL THEN
      PERFORM 1 FROM itap.acknowledge_incident(hasura_session, page_incident);
    END IF;
  END IF;

  UPDATE itap.user_notifications n
  SET acknowledged_at = coalesce(n.acknowledged_at, now())
  WHERE n.organization_id = org AND n.id = p_notification AND n.user_id = me;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('notification_not_found');
  END IF;
  RETURN QUERY SELECT * FROM itap.user_notifications n WHERE n.organization_id = org AND n.id = p_notification;
END;
$function$;
