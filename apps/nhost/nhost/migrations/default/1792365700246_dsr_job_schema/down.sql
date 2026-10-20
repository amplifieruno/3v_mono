DROP TABLE itap_results.dsr_bundles;
-- Rows using the new values (append-only tables: under the retention context).
SELECT set_config('itap.retention_context', 'on', true);
DELETE FROM itap.audit_log WHERE action IN ('erase', 'rectify');
DELETE FROM itap.notification_rule_event_types WHERE event_type = 'dsr_overdue';
DELETE FROM itap.webhook_subscription_event_types WHERE event_type = 'dsr_overdue';
DELETE FROM itap.notification_subscriptions WHERE event_type = 'dsr_overdue';
DELETE FROM itap.events WHERE event_type = 'dsr_overdue';
SELECT set_config('itap.retention_context', 'off', true);
DELETE FROM itap.audit_actions WHERE value IN ('erase', 'rectify');
DELETE FROM itap.event_types WHERE value = 'dsr_overdue';
DROP INDEX itap.data_subject_requests_overdue_idx;

DROP TRIGGER audit ON itap.data_subject_requests;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.data_subject_requests
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change(
    'ignore:attempts', 'ignore:attempts_at_retry', 'ignore:lease_expires_at', 'ignore:last_error');

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

ALTER TABLE itap.data_subject_requests
  DROP CONSTRAINT data_subject_requests_partial,
  DROP CONSTRAINT data_subject_requests_outcome,
  DROP CONSTRAINT data_subject_requests_details_object,
  DROP COLUMN overdue_notified_at,
  DROP COLUMN outcome,
  DROP COLUMN details,
  DROP COLUMN partial;
