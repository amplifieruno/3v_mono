-- Order: the Hasura metadata references the computed field integrations.has_secret. Before migrating down, remove it
-- from apps/nhost/metadata-src/compliance.ts, run `pnpm --filter nhost metadata:generate` and apply the metadata.
DROP FUNCTION itap.integration_has_secret(itap.integrations);
