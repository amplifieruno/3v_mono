-- Console inbox "Mark all read": mark_notifications_read with p_ids NULL marks every unread notification of the
-- caller (session organization AND session user) and returns the rows it changed, so the console needs no list of
-- ids (it may have read only a page of them). A list of ids works as before: every listed row of the caller is
-- returned, read now or earlier; ids of other members or organizations are skipped.
CREATE OR REPLACE FUNCTION itap.mark_notifications_read(hasura_session json, p_ids uuid[])
RETURNS SETOF itap.user_notifications
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  me uuid := itap.session_user_id(hasura_session);
BEGIN
  IF p_ids IS NULL THEN
    RETURN QUERY
    UPDATE itap.user_notifications n
    SET read_at = now()
    WHERE n.organization_id = org AND n.user_id = me AND n.read_at IS NULL
    RETURNING n.*;
    RETURN;
  END IF;
  RETURN QUERY
  UPDATE itap.user_notifications n
  SET read_at = coalesce(n.read_at, now())
  WHERE n.organization_id = org AND n.user_id = me AND n.id = ANY (p_ids)
  RETURNING n.*;
END;
$$;
