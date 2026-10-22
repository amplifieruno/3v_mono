-- Order: the Hasura metadata references dashboards.is_default and the computed field owned_by_me. Before migrating
-- down, remove them from apps/nhost/metadata-src/analytics.ts, run `pnpm --filter nhost metadata:generate` and apply
-- the metadata; otherwise the metadata turns inconsistent.
DROP FUNCTION itap.dashboard_owned_by_me(itap.dashboards, json);
DROP TRIGGER dashboards_single_default ON itap.dashboards;
DROP FUNCTION itap.dashboards_single_default();
DROP INDEX itap.dashboards_one_default_key;
ALTER TABLE itap.dashboards DROP COLUMN is_default;
