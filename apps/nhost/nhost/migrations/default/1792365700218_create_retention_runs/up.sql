-- Retention run log (spec §6.14; slice 10 task 1 schema, task 2 the engine). Read-only for org_admin, not audited
-- (system log). One non-dry run per organization and scheduled time (the daily cron is idempotent and resumes a
-- crashed run); dry runs (planner) are unrestricted. retention_run_classes: one row per class and scope the run
-- processed: the policy applied, cutoff, affected rows, rows skipped because a legal hold covers them, batches.
CREATE TABLE itap.retention_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  dry_run boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'running' REFERENCES itap.retention_run_statuses (value),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retention_runs_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT retention_runs_finished CHECK ((status = 'running') = (finished_at IS NULL)),
  CONSTRAINT retention_runs_error CHECK (status = 'failed' OR error IS NULL)
);
CREATE UNIQUE INDEX retention_runs_scheduled_key ON itap.retention_runs (organization_id, scheduled_at) WHERE NOT dry_run;
CREATE INDEX retention_runs_organization_id_status_idx ON itap.retention_runs (organization_id, status);
CREATE INDEX retention_runs_organization_id_started_at_idx ON itap.retention_runs (organization_id, started_at DESC);
CREATE TRIGGER retention_runs_set_updated_at BEFORE UPDATE ON itap.retention_runs
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();

CREATE TABLE itap.retention_run_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  data_class text NOT NULL REFERENCES itap.retention_data_classes (value),
  facility_id uuid,
  policy_id uuid,
  action text NOT NULL REFERENCES itap.retention_actions (value),
  cutoff timestamptz NOT NULL,
  affected integer NOT NULL DEFAULT 0,
  skipped_by_hold integer NOT NULL DEFAULT 0,
  batches integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retention_run_classes_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT retention_run_classes_counts CHECK (affected >= 0 AND skipped_by_hold >= 0 AND batches >= 0),
  CONSTRAINT retention_run_classes_run_fkey FOREIGN KEY (organization_id, run_id)
    REFERENCES itap.retention_runs (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT retention_run_classes_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id) ON DELETE SET NULL (facility_id),
  CONSTRAINT retention_run_classes_policy_fkey FOREIGN KEY (organization_id, policy_id)
    REFERENCES itap.retention_policies (organization_id, id) ON DELETE SET NULL (policy_id)
);
CREATE INDEX retention_run_classes_organization_id_run_id_idx ON itap.retention_run_classes (organization_id, run_id);
CREATE INDEX retention_run_classes_organization_id_data_class_idx ON itap.retention_run_classes (organization_id, data_class);
CREATE INDEX retention_run_classes_organization_id_facility_id_idx ON itap.retention_run_classes (organization_id, facility_id);
CREATE INDEX retention_run_classes_organization_id_policy_id_idx ON itap.retention_run_classes (organization_id, policy_id);
CREATE INDEX retention_run_classes_organization_id_action_idx ON itap.retention_run_classes (organization_id, action);
CREATE TRIGGER retention_run_classes_set_updated_at BEFORE UPDATE ON itap.retention_run_classes
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
