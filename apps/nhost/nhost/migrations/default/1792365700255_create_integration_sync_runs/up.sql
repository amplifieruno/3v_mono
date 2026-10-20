-- Integration sync runs (spec §6.15, §8.4 run_sync; slice 10 task 4). Read-only log for org_admin (not audited, like
-- retention runs): one row per sync, created by the action run_integration_sync (trigger manual) or the cron
-- run_integration_schedules (trigger schedule); the run_sync event trigger (backend) claims it with a lease
-- (attempts, lease_expires_at), applies it and completes or fails it. One running run per integration.
-- Counts: records_in (source records read), records_out (records written / pushed), created / updated / deactivated
-- (HR profiles), skipped (records refused); errors: at most 50 entries {row, code} (never source values).
-- fixture_file_id: the HR fixture the run applied (integrations.config.fixture_file_id at request time).
-- integrations: config.schedule_cron (5-field, UTC unless config.schedule_timezone) is validated here; next_sync_at is
-- the cron's bookkeeping (system column, not audited, reset when the schedule changes).
CREATE TABLE itap.integration_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  trigger text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  records_in integer NOT NULL DEFAULT 0,
  records_out integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  deactivated_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  fixture_file_id uuid REFERENCES storage.files (id) ON DELETE SET NULL,
  requested_by uuid,
  attempts integer NOT NULL DEFAULT 0,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_sync_runs_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT integration_sync_runs_trigger_valid CHECK (trigger IN ('manual', 'schedule')),
  CONSTRAINT integration_sync_runs_status_valid CHECK (status IN ('running', 'succeeded', 'failed')),
  CONSTRAINT integration_sync_runs_finished CHECK ((status = 'running') = (finished_at IS NULL)),
  CONSTRAINT integration_sync_runs_error CHECK (status = 'failed' OR error IS NULL),
  CONSTRAINT integration_sync_runs_counts CHECK (
    records_in >= 0 AND records_out >= 0 AND created_count >= 0 AND updated_count >= 0 AND deactivated_count >= 0
    AND skipped_count >= 0 AND attempts >= 0),
  CONSTRAINT integration_sync_runs_errors_array CHECK (jsonb_typeof(errors) = 'array' AND jsonb_array_length(errors) <= 50),
  CONSTRAINT integration_sync_runs_integration_fkey FOREIGN KEY (organization_id, integration_id)
    REFERENCES itap.integrations (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT integration_sync_runs_requested_by_fkey FOREIGN KEY (organization_id, requested_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX integration_sync_runs_organization_id_integration_id_idx
  ON itap.integration_sync_runs (organization_id, integration_id, started_at DESC);
CREATE INDEX integration_sync_runs_organization_id_requested_by_idx ON itap.integration_sync_runs (organization_id, requested_by);
CREATE INDEX integration_sync_runs_organization_id_fixture_file_id_idx ON itap.integration_sync_runs (organization_id, fixture_file_id);
CREATE UNIQUE INDEX integration_sync_runs_one_running ON itap.integration_sync_runs (organization_id, integration_id)
  WHERE status = 'running';
-- Reclaim scan of the cron (expired leases, never-claimed runs).
CREATE INDEX integration_sync_runs_running_idx ON itap.integration_sync_runs (updated_at) WHERE status = 'running';
CREATE TRIGGER integration_sync_runs_set_updated_at BEFORE UPDATE ON itap.integration_sync_runs
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();

ALTER TABLE itap.integrations ADD COLUMN next_sync_at timestamptz;
ALTER TABLE itap.integrations ADD CONSTRAINT integrations_schedule_valid CHECK (
  (NOT config ? 'schedule_cron' OR (jsonb_typeof(config -> 'schedule_cron') = 'string' AND itap.valid_cron(config ->> 'schedule_cron')))
  AND (NOT config ? 'schedule_timezone'
       OR (jsonb_typeof(config -> 'schedule_timezone') = 'string' AND itap.is_valid_timezone(config ->> 'schedule_timezone'))));
ALTER TABLE itap.integrations ADD CONSTRAINT integrations_fixture_file_valid CHECK (
  NOT config ? 'fixture_file_id'
  OR (jsonb_typeof(config -> 'fixture_file_id') = 'string'
      AND config ->> 'fixture_file_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'));
CREATE INDEX integrations_next_sync_idx ON itap.integrations (next_sync_at) WHERE config ? 'schedule_cron';

-- A changed schedule (cron, timezone) or a pause / resume is picked up by the next cron run.
CREATE FUNCTION itap.integrations_schedule_reset() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF NEW.config -> 'schedule_cron' IS DISTINCT FROM OLD.config -> 'schedule_cron'
     OR NEW.config -> 'schedule_timezone' IS DISTINCT FROM OLD.config -> 'schedule_timezone'
     OR (NEW.status = 'paused') IS DISTINCT FROM (OLD.status = 'paused') THEN
    NEW.next_sync_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER integrations_schedule_reset BEFORE UPDATE OF config, status ON itap.integrations
  FOR EACH ROW EXECUTE FUNCTION itap.integrations_schedule_reset();

-- The audit trigger skips the cron's bookkeeping column.
DROP TRIGGER audit ON itap.integrations;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.integrations
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change('secret', 'ignore:last_sync_at', 'ignore:last_error', 'ignore:next_sync_at');
