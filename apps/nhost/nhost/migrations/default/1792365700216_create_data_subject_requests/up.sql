-- Data subject requests (spec §6.14; slice 10 task 1 schema, task 3 the fulfil_dsr job). Code DSR-xxxxx.
--   received -> in_progress (claimed by the job with a lease; attempts + 1) -> completed | rejected
--   received -> rejected; in_progress -> in_progress (expired lease reclaimed); completed / rejected are terminal.
-- org_admin inserts (profile, type, received_at, optional due_at, notes; requested_by = the session member) and
-- edits notes; status / completion / export file / job columns are system columns (read-only, not audited where
-- they are lease bookkeeping). due_at defaults to received_at + 30 days (GDPR Art. 12(3)); an explicit due_at may
-- extend it up to received_at + 90 days. export_file_id: the access / portability bundle (sensitive file kind
-- dsr_export). Requests are records of compliance: never deleted by org_admin; profile SET NULL keeps the record.

-- Generic BEFORE INSERT OR UPDATE trigger: EXECUTE FUNCTION itap.check_file_kind('<column>', '<kind>', ...) — a
-- changed, non-null file column must reference a file whose metadata.kind is <kind> (file_kind_mismatch:<column>).
CREATE FUNCTION itap.check_file_kind() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  i integer := 0;
  col text;
  expected text;
  new_value uuid;
  old_value uuid;
  file_kind text;
BEGIN
  IF TG_NARGS = 0 OR TG_NARGS % 2 <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'invalid_parameter_value', MESSAGE = 'check_file_kind: expects (column, kind) pairs';
  END IF;
  WHILE i < TG_NARGS LOOP
    col := TG_ARGV[i];
    expected := TG_ARGV[i + 1];
    i := i + 2;
    IF NOT (to_jsonb(NEW) ? col) THEN
      RAISE EXCEPTION USING ERRCODE = 'undefined_column', MESSAGE = 'check_file_kind: unknown column ' || col;
    END IF;
    new_value := (to_jsonb(NEW) ->> col)::uuid;
    old_value := CASE WHEN TG_OP = 'UPDATE' THEN (to_jsonb(OLD) ->> col)::uuid END;
    IF new_value IS NOT NULL AND (TG_OP = 'INSERT' OR new_value IS DISTINCT FROM old_value) THEN
      SELECT f.metadata ->> 'kind' INTO file_kind FROM storage.files f WHERE f.id = new_value;
      IF file_kind IS DISTINCT FROM expected THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'file_kind_mismatch:' || col;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TABLE itap.data_subject_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  number bigint NOT NULL,
  code text GENERATED ALWAYS AS ('DSR-' || lpad(number::text, 5, '0')) STORED,
  profile_id uuid,
  request_type text NOT NULL REFERENCES itap.dsr_types (value),
  status text NOT NULL DEFAULT 'received' REFERENCES itap.dsr_statuses (value),
  received_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  export_file_id uuid REFERENCES storage.files (id) ON DELETE SET NULL,
  notes text,
  rejection_reason text,
  requested_by uuid,
  attempts integer NOT NULL DEFAULT 0,
  attempts_at_retry integer NOT NULL DEFAULT 0,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT data_subject_requests_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT data_subject_requests_organization_id_number_key UNIQUE (organization_id, number),
  CONSTRAINT data_subject_requests_organization_id_code_key UNIQUE (organization_id, code),
  CONSTRAINT data_subject_requests_due_window CHECK (due_at > received_at AND due_at <= received_at + interval '90 days'),
  CONSTRAINT data_subject_requests_completion CHECK ((status IN ('completed', 'rejected')) = (completed_at IS NOT NULL)),
  CONSTRAINT data_subject_requests_rejection CHECK (
    (status = 'rejected') = (rejection_reason IS NOT NULL) AND (rejection_reason IS NULL OR btrim(rejection_reason) <> '')),
  CONSTRAINT data_subject_requests_attempts CHECK (attempts >= 0 AND attempts_at_retry BETWEEN 0 AND attempts),
  CONSTRAINT data_subject_requests_profile_fkey FOREIGN KEY (organization_id, profile_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE SET NULL (profile_id),
  CONSTRAINT data_subject_requests_requested_by_fkey FOREIGN KEY (organization_id, requested_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX data_subject_requests_organization_id_profile_id_idx ON itap.data_subject_requests (organization_id, profile_id);
CREATE INDEX data_subject_requests_organization_id_requested_by_idx ON itap.data_subject_requests (organization_id, requested_by);
CREATE INDEX data_subject_requests_organization_id_status_idx ON itap.data_subject_requests (organization_id, status);
CREATE INDEX data_subject_requests_organization_id_request_type_idx ON itap.data_subject_requests (organization_id, request_type);
CREATE INDEX data_subject_requests_organization_id_due_at_idx ON itap.data_subject_requests (organization_id, due_at);
CREATE INDEX data_subject_requests_organization_id_export_file_id_idx ON itap.data_subject_requests (organization_id, export_file_id);
-- Work for the job's safety-net cron (task 3): open requests.
CREATE INDEX data_subject_requests_open_idx ON itap.data_subject_requests (updated_at) WHERE status IN ('received', 'in_progress');

CREATE FUNCTION itap.dsr_transition_allowed(p_from text, p_to text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_from
    WHEN 'received' THEN p_to IN ('received', 'in_progress', 'rejected')
    WHEN 'in_progress' THEN p_to IN ('in_progress', 'completed', 'rejected')
    ELSE p_to = p_from
  END;
$$;

-- Every writer (trusted SQL included): a new request starts as received with a profile and clean job columns, not
-- dated in the future; due_at defaults to received_at + 30 days; status transitions; subject and type are fixed.
CREATE FUNCTION itap.data_subject_requests_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.profile_id IS NULL THEN
      PERFORM itap.raise_code('dsr_profile_required');
    END IF;
    IF NEW.status <> 'received' OR NEW.completed_at IS NOT NULL OR NEW.export_file_id IS NOT NULL
       OR NEW.rejection_reason IS NOT NULL OR NEW.attempts <> 0 OR NEW.lease_expires_at IS NOT NULL THEN
      PERFORM itap.raise_code('dsr_must_start_received');
    END IF;
    IF NEW.received_at > now() + interval '5 minutes' THEN
      PERFORM itap.raise_code('dsr_received_in_future');
    END IF;
    NEW.due_at := coalesce(NEW.due_at, NEW.received_at + interval '30 days');
    RETURN NEW;
  END IF;
  IF NOT itap.dsr_transition_allowed(OLD.status, NEW.status) THEN
    PERFORM itap.raise_code('dsr_invalid_transition');
  END IF;
  IF NEW.request_type IS DISTINCT FROM OLD.request_type OR NEW.received_at IS DISTINCT FROM OLD.received_at
     OR (NEW.profile_id IS DISTINCT FROM OLD.profile_id AND NEW.profile_id IS NOT NULL) THEN
    PERFORM itap.raise_code('dsr_subject_immutable');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER data_subject_requests_guard BEFORE INSERT OR UPDATE ON itap.data_subject_requests
  FOR EACH ROW EXECUTE FUNCTION itap.data_subject_requests_guard();
CREATE TRIGGER data_subject_requests_number BEFORE INSERT ON itap.data_subject_requests
  FOR EACH ROW EXECUTE FUNCTION itap.assign_number('data_subject_request');
CREATE TRIGGER data_subject_requests_stamp_requested_by BEFORE INSERT ON itap.data_subject_requests
  FOR EACH ROW EXECUTE FUNCTION itap.stamp_session_member('requested_by');
CREATE TRIGGER data_subject_requests_check_files BEFORE INSERT OR UPDATE OF export_file_id ON itap.data_subject_requests
  FOR EACH ROW EXECUTE FUNCTION itap.check_file_bucket('export_file_id');
CREATE TRIGGER data_subject_requests_check_file_kinds BEFORE INSERT OR UPDATE OF export_file_id ON itap.data_subject_requests
  FOR EACH ROW EXECUTE FUNCTION itap.check_file_kind('export_file_id', 'dsr_export');
CREATE TRIGGER data_subject_requests_set_updated_at BEFORE UPDATE ON itap.data_subject_requests
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.data_subject_requests
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change(
    'ignore:attempts', 'ignore:attempts_at_retry', 'ignore:lease_expires_at', 'ignore:last_error');

-- Step log of a request (read-only for org_admin; written by the job, task 3). Append-only: rows are never updated
-- (the request cascade / retention may delete them).
CREATE TABLE itap.dsr_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  step text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dsr_steps_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT dsr_steps_step_not_blank CHECK (btrim(step) <> ''),
  CONSTRAINT dsr_steps_details_object CHECK (jsonb_typeof(details) = 'object'),
  CONSTRAINT dsr_steps_request_fkey FOREIGN KEY (organization_id, request_id)
    REFERENCES itap.data_subject_requests (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX dsr_steps_organization_id_request_id_at_idx ON itap.dsr_steps (organization_id, request_id, at);

CREATE FUNCTION itap.dsr_steps_append_only() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  PERFORM itap.raise_code('dsr_step_append_only');
  RETURN NULL;
END;
$$;
CREATE TRIGGER dsr_steps_append_only BEFORE UPDATE ON itap.dsr_steps
  FOR EACH ROW EXECUTE FUNCTION itap.dsr_steps_append_only();
