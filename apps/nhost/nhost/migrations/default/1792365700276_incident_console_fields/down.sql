-- Order: the Hasura metadata references the function (computed field incidents.assigned_to_me). Before migrating
-- down, remove it from apps/nhost/metadata-src/incidents.ts, run `pnpm --filter nhost metadata:generate` and apply
-- the metadata; otherwise the metadata turns inconsistent.
DROP FUNCTION itap.incident_assigned_to_me(itap.incidents, json);
