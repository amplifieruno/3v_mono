-- Order: the Hasura metadata references both functions (detections computed fields profile_id and person_erased).
-- Before migrating down, remove them from apps/nhost/metadata-src/tracking.ts, run
-- `pnpm --filter nhost metadata:generate` and apply the metadata; otherwise the metadata turns inconsistent.
DROP FUNCTION itap.detection_person_erased(itap.detections);
DROP FUNCTION itap.detection_profile_id(itap.detections);
