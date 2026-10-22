-- The console's "me" computed fields (migrations 276, 277) compare the row's user column with the session user
-- through itap.session_user_id(hasura_session), like every other function, instead of a lower()-ed text compare of
-- x-hasura-user-id. Same answers: a session without a valid user id matches nothing (false).
CREATE OR REPLACE FUNCTION itap.incident_assigned_to_me(incident_row itap.incidents, hasura_session json) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(incident_row.assigned_to = itap.session_user_id(hasura_session), false);
$$;

CREATE OR REPLACE FUNCTION itap.shift_handover_addressed_to_me(handover_row itap.shift_handovers, hasura_session json)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(handover_row.to_user_id = itap.session_user_id(hasura_session), false);
$$;

CREATE OR REPLACE FUNCTION itap.shift_handover_sent_by_me(handover_row itap.shift_handovers, hasura_session json)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(handover_row.from_user_id = itap.session_user_id(hasura_session), false);
$$;
