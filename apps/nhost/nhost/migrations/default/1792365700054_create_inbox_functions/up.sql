-- Inbox mutations for the owner (tracked for org_admin): rows of the session organization AND the session user only;
-- anything else raises notification_not_found (acknowledge) or is skipped (mark read). Stamping and copying the
-- acknowledgement to the delivery is done by the user_notifications triggers.
CREATE FUNCTION itap.acknowledge_notification(hasura_session json, p_notification uuid)
RETURNS SETOF itap.user_notifications
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
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
$$;

CREATE FUNCTION itap.mark_notifications_read(hasura_session json, p_ids uuid[])
RETURNS SETOF itap.user_notifications
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  me uuid := itap.session_user_id(hasura_session);
BEGIN
  RETURN QUERY
  UPDATE itap.user_notifications n
  SET read_at = coalesce(n.read_at, now())
  WHERE n.organization_id = org AND n.user_id = me AND n.id = ANY (p_ids)
  RETURNING n.*;
END;
$$;
