-- Console support for dashboards:
-- * dashboards.owned_by_me (computed, session): whether the session user owns the dashboard, so the console offers
--   editing and deleting only on the user's own dashboards (a shared dashboard of someone else is read only; the
--   update/delete permissions already refuse it) and lists "Mine" / "Shared with me".
-- * dashboards.is_default: the owner's landing dashboard, shown on the console's Dashboard page. One per owner in an
--   organization: making a dashboard the default clears the owner's previous default (as operator workspaces do),
--   instead of refusing the change.
ALTER TABLE itap.dashboards ADD COLUMN is_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX dashboards_one_default_key ON itap.dashboards (organization_id, owner_id) WHERE is_default;

CREATE FUNCTION itap.dashboards_single_default() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  UPDATE itap.dashboards
  SET is_default = false
  WHERE organization_id = NEW.organization_id AND owner_id = NEW.owner_id AND id <> NEW.id AND is_default;
  RETURN NEW;
END;
$$;

CREATE TRIGGER dashboards_single_default BEFORE INSERT OR UPDATE OF is_default ON itap.dashboards
  FOR EACH ROW WHEN (NEW.is_default) EXECUTE FUNCTION itap.dashboards_single_default();

CREATE FUNCTION itap.dashboard_owned_by_me(dashboard_row itap.dashboards, hasura_session json)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(dashboard_row.owner_id::text = lower(hasura_session ->> 'x-hasura-user-id'), false);
$$;
