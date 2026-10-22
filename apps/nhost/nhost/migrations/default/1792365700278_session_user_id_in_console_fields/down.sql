CREATE OR REPLACE FUNCTION itap.incident_assigned_to_me(incident_row itap.incidents, hasura_session json) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(incident_row.assigned_to::text = lower(hasura_session ->> 'x-hasura-user-id'), false);
$$;

CREATE OR REPLACE FUNCTION itap.shift_handover_addressed_to_me(handover_row itap.shift_handovers, hasura_session json)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(handover_row.to_user_id::text = lower(hasura_session ->> 'x-hasura-user-id'), false);
$$;

CREATE OR REPLACE FUNCTION itap.shift_handover_sent_by_me(handover_row itap.shift_handovers, hasura_session json)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(handover_row.from_user_id::text = lower(hasura_session ->> 'x-hasura-user-id'), false);
$$;
