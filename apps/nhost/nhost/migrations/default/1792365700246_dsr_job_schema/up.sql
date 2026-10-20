-- Slice 10 task 3: data subject request job columns, event type and audit actions.
-- * partial: an erasure that retained data under an active legal hold (GDPR Art. 17(3)(e)); dsr_steps names the
--   retained categories and the holds.
-- * details: what the requester asks for (rectification: the requested changes), set at filing, never changed.
-- * outcome: how org_admin closed a rectification (complete_dsr).
-- * overdue_notified_at: the dsr_overdue event was emitted (once per request).
-- * Event type dsr_overdue (SLA: due_at passed while open); audit actions erase / rectify (export, restrict, reject
--   exist).
-- * itap_results.dsr_bundles: row type of itap.dsr_bundle (the access / portability bundle for the backend job).

ALTER TABLE itap.data_subject_requests
  ADD COLUMN partial boolean NOT NULL DEFAULT false,
  ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN outcome text,
  ADD COLUMN overdue_notified_at timestamptz,
  ADD CONSTRAINT data_subject_requests_details_object CHECK (jsonb_typeof(details) = 'object'),
  ADD CONSTRAINT data_subject_requests_outcome CHECK (outcome IS NULL OR (status = 'completed' AND btrim(outcome) <> '')),
  ADD CONSTRAINT data_subject_requests_partial CHECK (NOT partial OR (status = 'completed' AND request_type = 'erasure'));

-- Every writer: a new request also starts with partial false, no outcome, no overdue mark; details are fixed.
CREATE OR REPLACE FUNCTION itap.data_subject_requests_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.profile_id IS NULL THEN
      PERFORM itap.raise_code('dsr_profile_required');
    END IF;
    IF NEW.status <> 'received' OR NEW.completed_at IS NOT NULL OR NEW.export_file_id IS NOT NULL
       OR NEW.rejection_reason IS NOT NULL OR NEW.attempts <> 0 OR NEW.lease_expires_at IS NOT NULL
       OR NEW.partial OR NEW.outcome IS NOT NULL OR NEW.overdue_notified_at IS NOT NULL THEN
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
  IF NEW.details IS DISTINCT FROM OLD.details AND NOT itap.retention_context() THEN
    PERFORM itap.raise_code('dsr_details_immutable');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER audit ON itap.data_subject_requests;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.data_subject_requests
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change(
    'ignore:attempts', 'ignore:attempts_at_retry', 'ignore:lease_expires_at', 'ignore:last_error',
    'ignore:overdue_notified_at');

-- Overdue sweep: open requests by due time.
CREATE INDEX data_subject_requests_overdue_idx ON itap.data_subject_requests (due_at)
  WHERE status IN ('received', 'in_progress') AND overdue_notified_at IS NULL;

INSERT INTO itap.event_types (value, description) VALUES ('dsr_overdue', 'Data subject request past its due date');
INSERT INTO itap.audit_actions (value, description) VALUES
  ('erase', 'Personal data of a person erased'),
  ('rectify', 'Rectification request closed');

CREATE TABLE itap_results.dsr_bundles (
  organization_id uuid NOT NULL,
  request_id uuid NOT NULL,
  bundle jsonb NOT NULL
);
