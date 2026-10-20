DROP FUNCTION itap.claim_file_deletions(integer);
ALTER TABLE itap.pending_file_deletions DROP COLUMN lease_expires_at;
