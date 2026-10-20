-- Slice 9 task 2 fix round 1: session binding of the claimed identity without an existence oracle. A verification
-- session stores claimed_ref_hash = sha256 (hex) of the claimed identity id as sent (canonical uuid text); the
-- claimed_identity_id FK stays nullable and is set only when the id exists in the organization (then it must hash to
-- claimed_ref_hash). auth_decide compares the attempt's claimed ref hash to it (IS NOT DISTINCT FROM).
-- Secret column (never selectable).
ALTER TABLE itap.authentication_sessions ADD COLUMN claimed_ref_hash text;
ALTER TABLE itap.authentication_sessions
  ADD CONSTRAINT authentication_sessions_claimed_ref CHECK (
    (claimed_ref_hash IS NULL OR claimed_ref_hash ~ '^[0-9a-f]{64}$')
    AND ((mode = 'verification') = (claimed_ref_hash IS NOT NULL))
    AND (claimed_identity_id IS NULL
         OR claimed_ref_hash = encode(sha256(convert_to(claimed_identity_id::text, 'UTF8')), 'hex'))
  );
