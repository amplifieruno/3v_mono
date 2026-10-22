-- Computed field for the console's incidents (read by org_admin through the existing select permission):
-- * incidents.assigned_to_me: whether the incident is assigned to the session user, so the incident list can
--   offer a fixed "Mine" view (a saved view holds literal filter values only, not the signed-in user).
CREATE FUNCTION itap.incident_assigned_to_me(incident_row itap.incidents, hasura_session json) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(incident_row.assigned_to::text = lower(hasura_session ->> 'x-hasura-user-id'), false);
$$;
