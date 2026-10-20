DROP TRIGGER identity_merge_sources_synthetic ON itap.identity_merge_sources;
DROP FUNCTION itap.identity_merge_sources_synthetic_check();
ALTER TABLE itap.identities DROP CONSTRAINT identities_synthetic_unlinked;
