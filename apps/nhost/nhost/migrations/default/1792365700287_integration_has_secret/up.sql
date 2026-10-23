-- Console support for integrations: integrations.has_secret (computed), whether a secret is stored. The secret itself
-- stays write-only (no select permission, set or cleared only by the action set_integration_secret); the console shows
-- "set" / "not set" and offers "Clear secret" only when one is stored.
CREATE FUNCTION itap.integration_has_secret(integration_row itap.integrations)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT integration_row.secret IS NOT NULL;
$$;
