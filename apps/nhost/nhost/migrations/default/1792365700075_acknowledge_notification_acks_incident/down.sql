-- Restores acknowledge_notification as of 1792365700054 (the incident is not touched).
CREATE OR REPLACE FUNCTION itap.acknowledge_notification(hasura_session json, p_notification uuid)
 RETURNS SETOF itap.user_notifications
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  me uuid := itap.session_user_id(hasura_session);
BEGIN
  UPDATE itap.user_notifications n
  SET acknowledged_at = coalesce(n.acknowledged_at, now())
  WHERE n.organization_id = org AND n.id = p_notification AND n.user_id = me;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('notification_not_found');
  END IF;
  RETURN QUERY SELECT * FROM itap.user_notifications n WHERE n.organization_id = org AND n.id = p_notification;
END;
$function$

;
