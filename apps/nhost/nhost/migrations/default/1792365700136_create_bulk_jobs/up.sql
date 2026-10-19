-- Bulk jobs (spec §6.11, §8.4 run_bulk_job; SA_3 §2.1.2 bulk profile operations, §2.1.4 bulk search), code BULK.
-- An org_admin uploads a CSV (storage, own organization bucket, metadata.kind = 'bulk_input': owner-only) and inserts
-- a job (kind, input_file_id, options; owner_id from the session). The run_bulk_job event trigger (backend) runs it:
--   queued -> running (claimed with a 2-minute lease, attempts + 1; extended by every progress update)
--          -> completed (no failed row) | partial (failed and succeeded rows) | failed (error, or every row failed).
--   running -> running: a worker that died is reclaimed after its lease (cron resume_bulk_jobs); it resumes after
--          `processed` (rows below it are never re-applied; the in-flight row is idempotent through bulk_job_rows).
--   queued | running -> cancelled: cancel_bulk_job.   failed | partial | cancelled -> queued: retry_bulk_job (rows
--          with a successful outcome are kept, only the others run again).
-- Rows: bulk_job_rows, one per input record (row_no 1.. after the header), written in the same transaction as the
-- profile change (partial commit per row; idempotent on (job, row_no)). errors: the first 500 failed rows
-- [{row_no, error}] (summary; every row stays in bulk_job_rows and the result file). result_file_id: CSV of every row
-- (kind bulk_result, or bulk_search_result for bulk_search: owner-only, since search results are personal).
-- Options (itap.valid_bulk_job_options): profile_import {dry_run}; profile_update {update_key: employee_id | email |
-- code (default employee_id), dry_run}; bulk_search {threshold 0.2..0.95, max_results 1..100}. dry_run validates every
-- row as the owner without committing anything (outcome validated).
-- Visibility: profile jobs are organization operations (every org_admin of the organization sees them and their
-- rows); bulk_search jobs and their rows only to their owner (search history is personal).
-- Job columns other than the definition are system columns (read-only, not audited). Jobs are history: no delete.
CREATE FUNCTION itap.valid_bulk_job_options(p_kind text, p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
DECLARE
  k text;
  v jsonb;
  n numeric;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RETURN false;
  END IF;
  FOR k, v IN SELECT e.key, e.value FROM jsonb_each(p) e LOOP
    IF k = 'dry_run' AND p_kind IN ('profile_import', 'profile_update') THEN
      IF jsonb_typeof(v) <> 'boolean' THEN
        RETURN false;
      END IF;
    ELSIF k = 'update_key' AND p_kind = 'profile_update' THEN
      IF v NOT IN ('"employee_id"'::jsonb, '"email"'::jsonb, '"code"'::jsonb) THEN
        RETURN false;
      END IF;
    ELSIF k = 'threshold' AND p_kind = 'bulk_search' THEN
      IF jsonb_typeof(v) <> 'number' OR (v #>> '{}')::numeric NOT BETWEEN 0.2 AND 0.95 THEN
        RETURN false;
      END IF;
    ELSIF k = 'max_results' AND p_kind = 'bulk_search' THEN
      IF jsonb_typeof(v) <> 'number' THEN
        RETURN false;
      END IF;
      n := (v #>> '{}')::numeric;
      IF n <> trunc(n) OR n NOT BETWEEN 1 AND 100 THEN
        RETURN false;
      END IF;
    ELSE
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE TABLE itap.bulk_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  number bigint NOT NULL,
  code text GENERATED ALWAYS AS ('BULK-' || lpad(number::text, 5, '0')) STORED,
  kind text NOT NULL REFERENCES itap.bulk_job_kinds (value),
  owner_id uuid NOT NULL,
  input_file_id uuid REFERENCES storage.files (id) ON DELETE SET NULL,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' REFERENCES itap.bulk_job_statuses (value),
  total integer,
  processed integer NOT NULL DEFAULT 0,
  succeeded integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  result_file_id uuid REFERENCES storage.files (id) ON DELETE SET NULL,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  attempts_at_retry integer NOT NULL DEFAULT 0,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bulk_jobs_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT bulk_jobs_organization_id_number_key UNIQUE (organization_id, number),
  CONSTRAINT bulk_jobs_organization_id_code_key UNIQUE (organization_id, code),
  CONSTRAINT bulk_jobs_options_valid CHECK (itap.valid_bulk_job_options(kind, options)),
  CONSTRAINT bulk_jobs_counters CHECK (
    (total IS NULL OR total BETWEEN 0 AND 10000) AND processed >= 0 AND succeeded >= 0 AND failed >= 0 AND skipped >= 0
    AND attempts >= 0 AND attempts_at_retry BETWEEN 0 AND attempts),
  CONSTRAINT bulk_jobs_errors_array CHECK (jsonb_typeof(errors) = 'array'),
  CONSTRAINT bulk_jobs_owner_fkey FOREIGN KEY (organization_id, owner_id)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX bulk_jobs_organization_id_owner_id_idx ON itap.bulk_jobs (organization_id, owner_id);
CREATE INDEX bulk_jobs_organization_id_kind_idx ON itap.bulk_jobs (organization_id, kind);
CREATE INDEX bulk_jobs_organization_id_status_idx ON itap.bulk_jobs (organization_id, status);
CREATE INDEX bulk_jobs_organization_id_input_file_id_idx ON itap.bulk_jobs (organization_id, input_file_id);
CREATE INDEX bulk_jobs_organization_id_result_file_id_idx ON itap.bulk_jobs (organization_id, result_file_id);
CREATE INDEX bulk_jobs_organization_id_created_at_idx ON itap.bulk_jobs (organization_id, created_at DESC);
-- Work for the resume_bulk_jobs cron (queued jobs the trigger missed, expired leases).
CREATE INDEX bulk_jobs_pending_idx ON itap.bulk_jobs (updated_at) WHERE status IN ('queued', 'running');

CREATE FUNCTION itap.bulk_job_transition_allowed(p_from text, p_to text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_from
    WHEN 'queued' THEN p_to IN ('queued', 'running', 'failed', 'cancelled')
    WHEN 'running' THEN p_to IN ('running', 'completed', 'partial', 'failed', 'cancelled')
    WHEN 'failed' THEN p_to IN ('failed', 'queued')
    WHEN 'partial' THEN p_to IN ('partial', 'queued')
    WHEN 'cancelled' THEN p_to IN ('cancelled', 'queued')
    ELSE p_to = p_from
  END;
$$;

-- Every writer: status transitions; the definition (kind, owner, options) never changes and the input file may only
-- go NULL (file deleted). On insert (and a changed input file) the input must be a `bulk_input` file of the
-- organization bucket uploaded by the job owner (bulk_input_not_found: nothing is disclosed).
CREATE FUNCTION itap.bulk_jobs_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  f record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT itap.bulk_job_transition_allowed(OLD.status, NEW.status) THEN
      PERFORM itap.raise_code('bulk_job_invalid_transition');
    END IF;
    IF (NEW.kind, NEW.owner_id, NEW.options) IS DISTINCT FROM (OLD.kind, OLD.owner_id, OLD.options)
       OR (NEW.input_file_id IS DISTINCT FROM OLD.input_file_id AND NEW.input_file_id IS NOT NULL) THEN
      PERFORM itap.raise_code('bulk_job_definition_frozen');
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.input_file_id IS NULL AND NOT itap.seed_context() THEN
    PERFORM itap.raise_code('bulk_input_required');
  END IF;
  IF NEW.input_file_id IS NOT NULL AND TG_OP = 'INSERT' THEN
    SELECT fl.bucket_id, fl.uploaded_by_user_id, fl.metadata ->> 'kind' AS kind INTO f
    FROM storage.files fl WHERE fl.id = NEW.input_file_id;
    IF NOT FOUND OR f.bucket_id IS DISTINCT FROM NEW.organization_id::text OR f.kind IS DISTINCT FROM 'bulk_input'
       OR f.uploaded_by_user_id IS DISTINCT FROM NEW.owner_id THEN
      PERFORM itap.raise_code('bulk_input_not_found');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bulk_jobs_guard BEFORE INSERT OR UPDATE ON itap.bulk_jobs
  FOR EACH ROW EXECUTE FUNCTION itap.bulk_jobs_guard();
CREATE TRIGGER bulk_jobs_number BEFORE INSERT ON itap.bulk_jobs
  FOR EACH ROW EXECUTE FUNCTION itap.assign_number('bulk_job');
CREATE TRIGGER bulk_jobs_owner_active BEFORE INSERT ON itap.bulk_jobs
  FOR EACH ROW EXECUTE FUNCTION itap.active_member_check('owner_id');
CREATE TRIGGER bulk_jobs_set_updated_at BEFORE UPDATE ON itap.bulk_jobs
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.bulk_jobs
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change(
    'ignore:status', 'ignore:total', 'ignore:processed', 'ignore:succeeded', 'ignore:failed', 'ignore:skipped',
    'ignore:result_file_id', 'ignore:errors', 'ignore:error', 'ignore:attempts', 'ignore:attempts_at_retry',
    'ignore:lease_expires_at', 'ignore:started_at', 'ignore:completed_at');

-- One row per input record of a job (read-only; written by the backend through the processing functions; not
-- audited: high volume, the profile changes themselves are audited). A successful outcome is final; a failed row is
-- replaced when a retry applies it again. Links go NULL when the linked row is deleted (log rows, spec §6.0).
-- private_owner_id: the job owner on rows of personal (bulk_search) jobs, NULL on organization (profile) jobs; the
-- select permission filters on it directly (a relationship filter would put an EXISTS over bulk_jobs around the
-- row-writing mutation functions, and Postgres may then skip executing them).
CREATE TABLE itap.bulk_job_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  bulk_job_id uuid NOT NULL,
  row_no integer NOT NULL,
  private_owner_id uuid,
  outcome text NOT NULL REFERENCES itap.bulk_job_row_outcomes (value),
  profile_id uuid,
  identity_id uuid,
  search_request_id uuid,
  entity_code text,
  label text,
  confidence real,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bulk_job_rows_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT bulk_job_rows_job_row_key UNIQUE (organization_id, bulk_job_id, row_no),
  CONSTRAINT bulk_job_rows_row_no_positive CHECK (row_no >= 1),
  CONSTRAINT bulk_job_rows_error_iff_failed CHECK ((outcome = 'failed') = (error IS NOT NULL)),
  CONSTRAINT bulk_job_rows_bulk_job_fkey FOREIGN KEY (organization_id, bulk_job_id)
    REFERENCES itap.bulk_jobs (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT bulk_job_rows_private_owner_fkey FOREIGN KEY (organization_id, private_owner_id)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT bulk_job_rows_profile_fkey FOREIGN KEY (organization_id, profile_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE SET NULL (profile_id),
  CONSTRAINT bulk_job_rows_identity_fkey FOREIGN KEY (organization_id, identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE SET NULL (identity_id),
  CONSTRAINT bulk_job_rows_search_request_fkey FOREIGN KEY (organization_id, search_request_id)
    REFERENCES itap.search_requests (organization_id, id) ON DELETE SET NULL (search_request_id)
);
CREATE INDEX bulk_job_rows_organization_id_profile_id_idx ON itap.bulk_job_rows (organization_id, profile_id);
CREATE INDEX bulk_job_rows_organization_id_identity_id_idx ON itap.bulk_job_rows (organization_id, identity_id);
CREATE INDEX bulk_job_rows_organization_id_search_request_id_idx ON itap.bulk_job_rows (organization_id, search_request_id);
CREATE INDEX bulk_job_rows_organization_id_private_owner_id_idx ON itap.bulk_job_rows (organization_id, private_owner_id);
CREATE INDEX bulk_job_rows_organization_id_outcome_idx ON itap.bulk_job_rows (organization_id, outcome);
CREATE TRIGGER bulk_job_rows_set_updated_at BEFORE UPDATE ON itap.bulk_job_rows
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
