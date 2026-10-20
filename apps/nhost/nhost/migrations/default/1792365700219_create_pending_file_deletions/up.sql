-- Storage deletion queue (slice 10 ruling: one mechanism for retention and DSR). SQL purge / erasure functions
-- enqueue files (itap.enqueue_file_deletion) in the same transaction as the rows they remove; the backend drains the
-- queue through the storage API (retention cron, DSR job), counting attempts and the last error. A file deleted by
-- the storage API removes its queue row (FK CASCADE from storage.files). organization_id has no FK so an entry
-- survives its organization's cascade (the bucket's files still need deleting). Internal: no permissions.
CREATE TABLE itap.pending_file_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  file_id uuid NOT NULL REFERENCES storage.files (id) ON DELETE CASCADE,
  reason text NOT NULL,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  last_error text,
  CONSTRAINT pending_file_deletions_file_key UNIQUE (file_id),
  CONSTRAINT pending_file_deletions_reason_not_blank CHECK (btrim(reason) <> ''),
  CONSTRAINT pending_file_deletions_attempts CHECK (attempts >= 0)
);
CREATE INDEX pending_file_deletions_organization_id_file_id_idx ON itap.pending_file_deletions (organization_id, file_id);
CREATE INDEX pending_file_deletions_enqueued_at_idx ON itap.pending_file_deletions (enqueued_at);

-- Enqueues a file for deletion (idempotent; a file already gone or not in the organization's bucket is ignored).
-- Returns whether a queue row exists for it afterwards.
CREATE FUNCTION itap.enqueue_file_deletion(p_org uuid, p_file uuid, p_reason text) RETURNS boolean
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF p_file IS NULL OR NOT EXISTS (SELECT 1 FROM storage.files f WHERE f.id = p_file AND f.bucket_id = p_org::text) THEN
    RETURN false;
  END IF;
  INSERT INTO itap.pending_file_deletions (organization_id, file_id, reason)
  VALUES (p_org, p_file, p_reason)
  ON CONFLICT (file_id) DO NOTHING;
  RETURN true;
END;
$$;
