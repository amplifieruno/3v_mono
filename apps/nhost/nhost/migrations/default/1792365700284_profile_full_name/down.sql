-- Order: the Hasura metadata references the function (computed field of profiles). Before migrating down, remove it
-- from apps/nhost/metadata-src/profiles.ts, run `pnpm --filter nhost metadata:generate` and apply the metadata;
-- otherwise the metadata turns inconsistent.
DROP FUNCTION itap.profile_full_name(itap.profiles);
