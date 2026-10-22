-- UI phase 4 final wave (I1, bd 3v_mono-t45): face source photos (storage.files.metadata.kind = 'face_source').
-- The console uploads them for an enrollment action (enroll_face, create_identity_from_photos, add_identity_photos),
-- which stores its own crop of each accepted face (kind identity_photo, metadata.source_file_id = the source). No row
-- references a source, so nothing deleted it: originals of accepted, refused and abandoned requests stayed in storage.
-- * itap.enqueue_unused_files queues the face_source originals of the crops it is given (retention of photos,
--   biometric deletion, DSR erasure): the original goes with its crop.
-- * itap.enqueue_stale_face_sources(p_older_than, p_limit) queues every unused face_source file uploaded before
--   p_older_than, whatever the outcome of its request. The backend cron drain_file_deletions calls it with a one-hour
--   grace before draining, so an enrollment form can still be resent and its result can still show refused photos.

CREATE OR REPLACE FUNCTION itap.enqueue_unused_files(p_org uuid, p_files uuid[], p_reason text) RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  f uuid;
  n integer := 0;
  v_files uuid[];
BEGIN
  -- The face_source original of an identity photo crop (metadata.source_file_id) goes with the crop.
  v_files := coalesce(p_files, '{}') || ARRAY(
    SELECT s.id FROM storage.files c
    JOIN storage.files s ON s.id::text = c.metadata ->> 'source_file_id'
    WHERE c.id = ANY (coalesce(p_files, '{}')) AND c.bucket_id = p_org::text
      AND s.bucket_id = p_org::text AND s.metadata ->> 'kind' = 'face_source');
  FOR f IN SELECT DISTINCT x FROM unnest(v_files) x WHERE x IS NOT NULL LOOP
    IF NOT itap.file_in_use(p_org, f)
       AND NOT EXISTS (SELECT 1 FROM itap.pending_file_deletions q WHERE q.file_id = f)
       AND itap.enqueue_file_deletion(p_org, f, p_reason) THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;

-- Admin only (the drain_file_deletions cron): queues up to p_limit unused face_source files of organization buckets
-- uploaded before p_older_than (oldest first) and returns the queue rows it added.
CREATE FUNCTION itap.enqueue_stale_face_sources(p_older_than timestamptz, p_limit integer DEFAULT 500)
RETURNS SETOF itap.pending_file_deletions
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 5000 THEN
    PERFORM itap.raise_code('file_deletion_limit_invalid');
  END IF;
  IF p_older_than IS NULL THEN
    PERFORM itap.raise_code('face_source_cutoff_required');
  END IF;
  RETURN QUERY
  INSERT INTO itap.pending_file_deletions AS q (organization_id, file_id, reason)
  SELECT o.id, f.id, 'face_source'
  FROM storage.files f
  JOIN itap.organizations o ON o.id::text = f.bucket_id
  WHERE f.metadata ->> 'kind' = 'face_source' AND f.created_at < p_older_than
    AND NOT EXISTS (SELECT 1 FROM itap.pending_file_deletions x WHERE x.file_id = f.id)
    AND NOT itap.file_in_use(o.id, f.id)
  ORDER BY f.created_at, f.id
  LIMIT p_limit
  ON CONFLICT (file_id) DO NOTHING
  RETURNING q.*;
END;
$$;
