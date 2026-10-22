-- Console support for watch lists, shift handovers and operator workspaces (read by org_admin through the existing
-- select permissions; the function is exposed as a mutation):
-- * watch_list_entries.active: the entry is in force now (no expiry, or the expiry is still ahead), so the console
--   can offer fixed "Active" / "Expired" views (a saved view holds literal filter values only, not "now").
-- * shift_handovers.addressed_to_me / sent_by_me: whether the session user receives / sent the handover, for the
--   console's "For me" and "Sent by me" views (a saved view cannot name the signed-in user).
-- * add_open_incidents_to_handover(hasura_session, p_handover): the sender links every incident still being handled
--   (open, acknowledged, investigating) to an unacknowledged handover in one step, so the next operator sees them.
--   Already linked incidents are skipped; returns the links it added.
-- * operator_workspaces: making a workspace the default clears the user's previous default (one default per user,
--   operator_workspaces_one_default_key), instead of refusing the change.
CREATE FUNCTION itap.watch_list_entry_active(entry_row itap.watch_list_entries) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT entry_row.expires_at IS NULL OR entry_row.expires_at > now();
$$;

CREATE FUNCTION itap.shift_handover_addressed_to_me(handover_row itap.shift_handovers, hasura_session json)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(handover_row.to_user_id::text = lower(hasura_session ->> 'x-hasura-user-id'), false);
$$;

CREATE FUNCTION itap.shift_handover_sent_by_me(handover_row itap.shift_handovers, hasura_session json)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(handover_row.from_user_id::text = lower(hasura_session ->> 'x-hasura-user-id'), false);
$$;

CREATE FUNCTION itap.add_open_incidents_to_handover(hasura_session json, p_handover uuid)
RETURNS SETOF itap.shift_handover_incidents
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  handover itap.shift_handovers;
BEGIN
  SELECT * INTO handover FROM itap.shift_handovers WHERE organization_id = org AND id = p_handover FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('handover_not_found');
  END IF;
  IF handover.from_user_id IS DISTINCT FROM itap.session_user_id(hasura_session) THEN
    PERFORM itap.raise_code('handover_not_sender');
  END IF;
  IF handover.acknowledged_at IS NOT NULL THEN
    PERFORM itap.raise_code('handover_acknowledged');
  END IF;
  RETURN QUERY
  INSERT INTO itap.shift_handover_incidents (organization_id, handover_id, incident_id)
  SELECT org, p_handover, i.id
  FROM itap.incidents i
  WHERE i.organization_id = org AND i.status IN ('open', 'acknowledged', 'investigating')
  ORDER BY i.created_at
  ON CONFLICT (organization_id, handover_id, incident_id) DO NOTHING
  RETURNING *;
END;
$$;

CREATE FUNCTION itap.operator_workspaces_single_default() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  UPDATE itap.operator_workspaces
  SET is_default = false
  WHERE organization_id = NEW.organization_id AND user_id = NEW.user_id AND id <> NEW.id AND is_default;
  RETURN NEW;
END;
$$;

CREATE TRIGGER operator_workspaces_single_default BEFORE INSERT OR UPDATE OF is_default ON itap.operator_workspaces
  FOR EACH ROW WHEN (NEW.is_default) EXECUTE FUNCTION itap.operator_workspaces_single_default();
