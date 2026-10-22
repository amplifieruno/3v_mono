-- Order: the Hasura metadata references the function (computed field of segment_members). Before migrating down,
-- remove it from apps/nhost/metadata-src/segments.ts, run `pnpm --filter nhost metadata:generate` and apply the
-- metadata; otherwise the metadata turns inconsistent.
DROP FUNCTION itap.segment_member_opened_now(itap.segment_members);
