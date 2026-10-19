CREATE OR REPLACE FUNCTION itap.search_requests_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'queued' AND NEW.status IN ('running', 'failed'))
    OR (OLD.status = 'running' AND NEW.status IN ('completed', 'failed'))) THEN
    PERFORM itap.raise_code('search_invalid_transition');
  END IF;
  IF (NEW.user_id, NEW.search_type, NEW.filters, NEW.threshold, NEW.max_results, NEW.fuzzy)
       IS DISTINCT FROM (OLD.user_id, OLD.search_type, OLD.filters, OLD.threshold, OLD.max_results, OLD.fuzzy)
     OR (NEW.image_file_id IS DISTINCT FROM OLD.image_file_id AND NEW.image_file_id IS NOT NULL) THEN
    PERFORM itap.raise_code('search_definition_frozen');
  END IF;
  RETURN NEW;
END;
$$;
DROP INDEX itap.search_requests_organization_id_bulk_job_id_idx;
ALTER TABLE itap.search_requests DROP CONSTRAINT search_requests_bulk_job_fkey,
  DROP CONSTRAINT search_requests_bulk_job_row, DROP COLUMN bulk_job_row_no, DROP COLUMN bulk_job_id;
