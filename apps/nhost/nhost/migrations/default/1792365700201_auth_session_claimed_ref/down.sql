ALTER TABLE itap.authentication_sessions DROP CONSTRAINT IF EXISTS authentication_sessions_claimed_ref;
ALTER TABLE itap.authentication_sessions DROP COLUMN IF EXISTS claimed_ref_hash;
