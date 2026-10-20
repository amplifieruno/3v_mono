-- Export definitions and jobs (spec §6.15, §8.3 run_export_definitions, §8.4 run_export; slice 10 task 4).
--   export_entities: the exportable Hasura root fields (allowlist). The run_export job queries Hasura AS THE
--     REQUESTING MEMBER (org token: role org_admin, their user id), so the member's row and column permissions decide
--     what a file contains (Review Focus 4). detections are limited to the last 31 days.
--   export_definitions (EXP-xxxxx): entity, format, filters (a Hasura where for the entity, validated by the job's dry
--     query), mode full / incremental, watermark (ro: created_at — occurred_at for audit_log — of the last exported
--     row; advanced only when a job completes), schedule_cron (UTC unless timezone), is_active, owner (the session
--     member; only the owner edits, deletes and runs a definition, since jobs run with the owner's permissions).
--     Changing entity / filters / mode resets the watermark; changing the schedule resets next_run_at.
--   export_jobs: a snapshot of the definition at request (entity, format, mode, filters, watermark_from); requested_by
--     must be the definition owner and an active member; one open (queued / running) job per definition; status,
--     file and counts are written by the job (lease / attempt fencing). Files: org bucket kind `export` (sensitive,
--     owner-only: uploaded_by = requested_by, audited open).
CREATE TABLE itap.export_entities (value text PRIMARY KEY, description text);
INSERT INTO itap.export_entities (value, description) VALUES
  ('profiles', 'Profiles'),
  ('identities', 'Identities'),
  ('events', 'Events'),
  ('incidents', 'Incidents'),
  ('visits', 'Visits'),
  ('access_decisions', 'Access decisions'),
  ('detections', 'Detections (last 31 days)'),
  ('authentication_attempts', 'Face authentication attempts'),
  ('audit_log', 'Audit log');

INSERT INTO itap.audit_actions (value, description) VALUES ('export', 'Data exported to a file')
ON CONFLICT (value) DO NOTHING;

-- Active (and unexpired) member of the organization.
CREATE FUNCTION itap.member_active(p_org uuid, p_user uuid) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT EXISTS (SELECT 1 FROM itap.organization_members m
                 WHERE m.organization_id = p_org AND m.user_id = p_user AND m.status = 'active'
                   AND (m.expires_at IS NULL OR m.expires_at > now()));
$$;

CREATE TABLE itap.export_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  number bigint NOT NULL,
  code text GENERATED ALWAYS AS ('EXP-' || lpad(number::text, 5, '0')) STORED,
  name text NOT NULL,
  description text,
  entity text NOT NULL REFERENCES itap.export_entities (value),
  format text NOT NULL DEFAULT 'csv' REFERENCES itap.export_formats (value),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  mode text NOT NULL DEFAULT 'full' REFERENCES itap.export_modes (value),
  watermark timestamptz,
  schedule_cron text,
  timezone text NOT NULL DEFAULT 'UTC',
  is_active boolean NOT NULL DEFAULT true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_error text,
  last_failed_at timestamptz,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT export_definitions_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT export_definitions_organization_id_number_key UNIQUE (organization_id, number),
  CONSTRAINT export_definitions_organization_id_code_key UNIQUE (organization_id, code),
  CONSTRAINT export_definitions_organization_id_name_key UNIQUE (organization_id, name),
  CONSTRAINT export_definitions_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT export_definitions_filters_object CHECK (jsonb_typeof(filters) = 'object'),
  CONSTRAINT export_definitions_cron_valid CHECK (schedule_cron IS NULL OR itap.valid_cron(schedule_cron)),
  CONSTRAINT export_definitions_timezone_valid CHECK (itap.is_valid_timezone(timezone)),
  CONSTRAINT export_definitions_owner_fkey FOREIGN KEY (organization_id, owner_id)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX export_definitions_organization_id_entity_idx ON itap.export_definitions (organization_id, entity);
CREATE INDEX export_definitions_organization_id_format_idx ON itap.export_definitions (organization_id, format);
CREATE INDEX export_definitions_organization_id_mode_idx ON itap.export_definitions (organization_id, mode);
CREATE INDEX export_definitions_organization_id_owner_id_idx ON itap.export_definitions (organization_id, owner_id);
-- The cron's due scan (all organizations).
CREATE INDEX export_definitions_due_idx ON itap.export_definitions (next_run_at) WHERE is_active AND schedule_cron IS NOT NULL;

CREATE FUNCTION itap.export_definitions_prepare() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      PERFORM itap.raise_code('export_owner_immutable');
    END IF;
    IF (NEW.entity, NEW.filters, NEW.mode) IS DISTINCT FROM (OLD.entity, OLD.filters, OLD.mode) THEN
      NEW.watermark := NULL;
    END IF;
    IF (NEW.schedule_cron, NEW.timezone, NEW.is_active) IS DISTINCT FROM (OLD.schedule_cron, OLD.timezone, OLD.is_active) THEN
      NEW.next_run_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER export_definitions_prepare BEFORE INSERT OR UPDATE ON itap.export_definitions
  FOR EACH ROW EXECUTE FUNCTION itap.export_definitions_prepare();
CREATE TRIGGER export_definitions_number BEFORE INSERT ON itap.export_definitions
  FOR EACH ROW EXECUTE FUNCTION itap.assign_number('export_definition');
CREATE TRIGGER export_definitions_owner_active BEFORE INSERT ON itap.export_definitions
  FOR EACH ROW EXECUTE FUNCTION itap.active_member_check('owner_id');
CREATE TRIGGER export_definitions_set_updated_at BEFORE UPDATE ON itap.export_definitions
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.export_definitions
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change(
    'ignore:watermark', 'ignore:next_run_at', 'ignore:last_run_at', 'ignore:last_error', 'ignore:last_failed_at');

CREATE TABLE itap.export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  definition_id uuid NOT NULL,
  trigger text NOT NULL DEFAULT 'manual',
  scheduled_for timestamptz,
  status text NOT NULL DEFAULT 'queued' REFERENCES itap.export_job_statuses (value),
  entity text NOT NULL REFERENCES itap.export_entities (value),
  format text NOT NULL REFERENCES itap.export_formats (value),
  mode text NOT NULL REFERENCES itap.export_modes (value),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  watermark_from timestamptz,
  watermark_to timestamptz,
  file_id uuid REFERENCES storage.files (id) ON DELETE SET NULL,
  row_count integer,
  truncated boolean NOT NULL DEFAULT false,
  requested_by uuid NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  lease_expires_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT export_jobs_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT export_jobs_trigger_valid CHECK (trigger IN ('manual', 'schedule')),
  CONSTRAINT export_jobs_filters_object CHECK (jsonb_typeof(filters) = 'object'),
  CONSTRAINT export_jobs_finished CHECK ((status IN ('completed', 'failed')) = (finished_at IS NOT NULL)),
  CONSTRAINT export_jobs_completed CHECK (status <> 'completed' OR row_count IS NOT NULL),
  CONSTRAINT export_jobs_counts CHECK ((row_count IS NULL OR row_count >= 0) AND attempts >= 0),
  CONSTRAINT export_jobs_definition_fkey FOREIGN KEY (organization_id, definition_id)
    REFERENCES itap.export_definitions (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT export_jobs_requested_by_fkey FOREIGN KEY (organization_id, requested_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX export_jobs_organization_id_definition_id_idx ON itap.export_jobs (organization_id, definition_id, created_at DESC);
CREATE INDEX export_jobs_organization_id_status_idx ON itap.export_jobs (organization_id, status);
CREATE INDEX export_jobs_organization_id_entity_idx ON itap.export_jobs (organization_id, entity);
CREATE INDEX export_jobs_organization_id_format_idx ON itap.export_jobs (organization_id, format);
CREATE INDEX export_jobs_organization_id_mode_idx ON itap.export_jobs (organization_id, mode);
CREATE INDEX export_jobs_organization_id_requested_by_idx ON itap.export_jobs (organization_id, requested_by);
CREATE INDEX export_jobs_organization_id_file_id_idx ON itap.export_jobs (organization_id, file_id);
CREATE UNIQUE INDEX export_jobs_one_open ON itap.export_jobs (organization_id, definition_id)
  WHERE status IN ('queued', 'running');
-- Reclaim scan of the cron.
CREATE INDEX export_jobs_open_idx ON itap.export_jobs (updated_at) WHERE status IN ('queued', 'running');

-- Snapshot of the definition; every job column but definition_id / requested_by / trigger / scheduled_for is the
-- system's on insert.
CREATE FUNCTION itap.export_jobs_prepare() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  d itap.export_definitions;
BEGIN
  SELECT * INTO d FROM itap.export_definitions x WHERE x.organization_id = NEW.organization_id AND x.id = NEW.definition_id;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('export_definition_not_found');
  END IF;
  IF NEW.requested_by IS DISTINCT FROM d.owner_id THEN
    PERFORM itap.raise_code('export_owner_only');
  END IF;
  IF NOT itap.member_active(NEW.organization_id, NEW.requested_by) THEN
    PERFORM itap.raise_code('member_not_active:requested_by');
  END IF;
  IF EXISTS (SELECT 1 FROM itap.export_jobs j WHERE j.organization_id = NEW.organization_id
             AND j.definition_id = NEW.definition_id AND j.status IN ('queued', 'running')) THEN
    PERFORM itap.raise_code('export_job_active');
  END IF;
  NEW.status := 'queued';
  NEW.entity := d.entity;
  NEW.format := d.format;
  NEW.mode := d.mode;
  NEW.filters := d.filters;
  NEW.watermark_from := CASE WHEN d.mode = 'incremental' THEN d.watermark END;
  NEW.watermark_to := NULL;
  NEW.file_id := NULL;
  NEW.row_count := NULL;
  NEW.truncated := false;
  NEW.attempts := 0;
  NEW.lease_expires_at := NULL;
  NEW.started_at := NULL;
  NEW.finished_at := NULL;
  NEW.error := NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER export_jobs_prepare BEFORE INSERT ON itap.export_jobs
  FOR EACH ROW EXECUTE FUNCTION itap.export_jobs_prepare();
CREATE TRIGGER export_jobs_set_updated_at BEFORE UPDATE ON itap.export_jobs
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
-- The request is audited; the completion writes its own `export` audit row (complete_export_job).
CREATE TRIGGER audit AFTER INSERT OR DELETE ON itap.export_jobs
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
