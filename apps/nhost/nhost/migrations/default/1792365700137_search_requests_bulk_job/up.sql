-- Search requests run by a bulk_search job (slice 7 task 4): bulk_job_id + bulk_job_row_no (the input record), set
-- at insert only (part of the frozen definition). Owner-only like every request.
ALTER TABLE itap.search_requests
  ADD COLUMN bulk_job_id uuid,
  ADD COLUMN bulk_job_row_no integer,
  ADD CONSTRAINT search_requests_bulk_job_row CHECK ((bulk_job_id IS NULL) = (bulk_job_row_no IS NULL) AND (bulk_job_row_no IS NULL OR bulk_job_row_no >= 1)),
  ADD CONSTRAINT search_requests_bulk_job_fkey FOREIGN KEY (organization_id, bulk_job_id)
    REFERENCES itap.bulk_jobs (organization_id, id) ON DELETE NO ACTION;
CREATE INDEX search_requests_organization_id_bulk_job_id_idx
  ON itap.search_requests (organization_id, bulk_job_id, bulk_job_row_no);

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
  IF (NEW.user_id, NEW.search_type, NEW.filters, NEW.threshold, NEW.max_results, NEW.fuzzy, NEW.bulk_job_id,
      NEW.bulk_job_row_no)
       IS DISTINCT FROM (OLD.user_id, OLD.search_type, OLD.filters, OLD.threshold, OLD.max_results, OLD.fuzzy,
                         OLD.bulk_job_id, OLD.bulk_job_row_no)
     OR (NEW.image_file_id IS DISTINCT FROM OLD.image_file_id AND NEW.image_file_id IS NOT NULL) THEN
    PERFORM itap.raise_code('search_definition_frozen');
  END IF;
  RETURN NEW;
END;
$$;
