DROP FUNCTION itap.enqueue_stale_face_sources(timestamptz, integer);

CREATE OR REPLACE FUNCTION itap.enqueue_unused_files(p_org uuid, p_files uuid[], p_reason text) RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  f uuid;
  n integer := 0;
BEGIN
  FOR f IN SELECT DISTINCT x FROM unnest(coalesce(p_files, '{}')) x WHERE x IS NOT NULL LOOP
    IF NOT itap.file_in_use(p_org, f)
       AND NOT EXISTS (SELECT 1 FROM itap.pending_file_deletions q WHERE q.file_id = f)
       AND itap.enqueue_file_deletion(p_org, f, p_reason) THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;
