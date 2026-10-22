-- Order: the Hasura metadata references the computed field reports.requested_by_me. Before migrating down, remove it
-- from apps/nhost/metadata-src/reports.ts, run `pnpm --filter nhost metadata:generate` and apply the metadata.
DROP FUNCTION itap.report_requested_by_me(itap.reports, json);
