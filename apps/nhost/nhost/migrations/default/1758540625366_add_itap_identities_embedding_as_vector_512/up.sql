CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE itap.identities
    ADD COLUMN IF NOT EXISTS "embedding" vector(512);
