CREATE OR REPLACE FUNCTION itap.mark_notifications_read(hasura_session json, p_ids uuid[])
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
