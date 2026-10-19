-- Report templates and schedules (spec §6.10).
--   report_templates: report type, default format and parameters; is_system templates are seeded and read-only.
--     parameters (CHECK itap.valid_report_parameters): {"period": "previous_day" | "previous_week" | "previous_month"}
--     (default previous_day): the period a scheduled report covers, the previous complete period before the run.
--   report_schedules: a template on a cron (5-field subset, itap.valid_cron) in an IANA timezone, delivered on
--     `channel` to the members of recipient_group_id with that channel (email / in_app); channel `webhook` needs no
--     group: delivery is the report_generated event to webhook subscriptions. next_run_at / last_run_at are written
--     by the run_report_schedules cron (backend computes next runs; a cron, timezone or is_active change resets
--     next_run_at to NULL, recomputed by the next cron run). Scheduled reports cover the whole organization (all
--     facilities / segments): schedules have no targets.

-- 5-field cron subset: minute hour day-of-month month weekday; each field a comma list of `*` or `n` or `n-m`, each
-- optionally `/step` (step >= 1); ranges ascending and within the field (weekday 0-7, 7 = Sunday). No names, no
-- `?`/`L`/`W`/`#`. Mirrors apps/backend/src/reports/cron.ts. Never raises.
CREATE FUNCTION itap.valid_cron(p_cron text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
DECLARE
  fields text[];
  bounds int[] := ARRAY[0, 59, 0, 23, 1, 31, 1, 12, 0, 7];
  part text;
  m text[];
  lo int;
  hi int;
BEGIN
  IF p_cron IS NULL THEN
    RETURN false;
  END IF;
  fields := regexp_split_to_array(btrim(p_cron), '\s+');
  IF cardinality(fields) <> 5 THEN
    RETURN false;
  END IF;
  FOR i IN 1 .. 5 LOOP
    FOREACH part IN ARRAY string_to_array(fields[i], ',') LOOP
      m := regexp_match(part, '^(\*|([0-9]{1,2})(-([0-9]{1,2}))?)(/([0-9]{1,2}))?$');
      IF m IS NULL OR (m[6] IS NOT NULL AND m[6]::int < 1) THEN
        RETURN false;
      END IF;
      IF m[2] IS NOT NULL THEN
        lo := m[2]::int;
        hi := coalesce(m[4]::int, lo);
        IF lo < bounds[2 * i - 1] OR hi > bounds[2 * i] OR lo > hi THEN
          RETURN false;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN true;
END;
$$;

CREATE FUNCTION itap.valid_report_parameters(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(
    jsonb_typeof(p) = 'object'
    AND (NOT p ? 'period' OR p ->> 'period' IN ('previous_day', 'previous_week', 'previous_month'))
    AND (NOT p ? 'timezone' OR jsonb_typeof(p -> 'timezone') = 'string'),
    false);
$$;

-- The previous complete period before p_at in p_tz: previous_day = yesterday, previous_week = last ISO week
-- (Monday-Sunday), previous_month = last calendar month (inclusive local dates).
CREATE FUNCTION itap.report_period(p_period text, p_tz text, p_at timestamptz)
RETURNS TABLE (start_date date, end_date date)
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  WITH t AS (SELECT (p_at AT TIME ZONE p_tz)::date AS today)
  SELECT CASE p_period
           WHEN 'previous_week' THEN (date_trunc('week', today) - interval '7 days')::date
           WHEN 'previous_month' THEN (date_trunc('month', today) - interval '1 month')::date
           ELSE today - 1
         END,
         CASE p_period
           WHEN 'previous_week' THEN (date_trunc('week', today) - interval '1 day')::date
           WHEN 'previous_month' THEN (date_trunc('month', today) - interval '1 day')::date
           ELSE today - 1
         END
  FROM t;
$$;

CREATE TABLE itap.report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  report_type text NOT NULL REFERENCES itap.report_types (value),
  format text NOT NULL DEFAULT 'pdf' REFERENCES itap.report_formats (value),
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_templates_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT report_templates_organization_id_name_key UNIQUE (organization_id, name),
  CONSTRAINT report_templates_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT report_templates_parameters_valid CHECK (itap.valid_report_parameters(parameters)),
  CONSTRAINT report_templates_created_by_fkey FOREIGN KEY (organization_id, created_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX report_templates_organization_id_report_type_idx ON itap.report_templates (organization_id, report_type);
CREATE INDEX report_templates_organization_id_format_idx ON itap.report_templates (organization_id, format);
CREATE INDEX report_templates_organization_id_created_by_idx ON itap.report_templates (organization_id, created_by);
CREATE TRIGGER report_templates_set_updated_at BEFORE UPDATE ON itap.report_templates
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.report_templates
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

CREATE TABLE itap.report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  template_id uuid NOT NULL,
  name text NOT NULL,
  cron text NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  recipient_group_id uuid,
  channel text NOT NULL DEFAULT 'email' REFERENCES itap.notification_channels (value),
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_schedules_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT report_schedules_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT report_schedules_cron_valid CHECK (itap.valid_cron(cron)),
  CONSTRAINT report_schedules_timezone_valid CHECK (itap.is_valid_timezone(timezone)),
  CONSTRAINT report_schedules_channel_allowed CHECK (channel IN ('email', 'webhook', 'in_app')),
  CONSTRAINT report_schedules_recipients CHECK (channel = 'webhook' OR recipient_group_id IS NOT NULL),
  CONSTRAINT report_schedules_template_fkey FOREIGN KEY (organization_id, template_id)
    REFERENCES itap.report_templates (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT report_schedules_recipient_group_fkey FOREIGN KEY (organization_id, recipient_group_id)
    REFERENCES itap.recipient_groups (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT report_schedules_created_by_fkey FOREIGN KEY (organization_id, created_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX report_schedules_organization_id_template_id_idx ON itap.report_schedules (organization_id, template_id);
CREATE INDEX report_schedules_organization_id_recipient_group_id_idx ON itap.report_schedules (organization_id, recipient_group_id);
CREATE INDEX report_schedules_organization_id_channel_idx ON itap.report_schedules (organization_id, channel);
CREATE INDEX report_schedules_organization_id_created_by_idx ON itap.report_schedules (organization_id, created_by);
-- The cron's due scan (all organizations).
CREATE INDEX report_schedules_due_idx ON itap.report_schedules (next_run_at) WHERE is_active;

-- Incident templates cannot be scheduled (an incident report needs its incident); a new or rescheduled schedule
-- gets its next run from the next cron run.
CREATE FUNCTION itap.report_schedules_prepare() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.template_id IS DISTINCT FROM OLD.template_id THEN
    IF EXISTS (SELECT 1 FROM itap.report_templates t WHERE t.organization_id = NEW.organization_id
               AND t.id = NEW.template_id AND t.report_type = 'incident') THEN
      PERFORM itap.raise_code('report_schedule_incident_template');
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.cron IS DISTINCT FROM OLD.cron OR NEW.timezone IS DISTINCT FROM OLD.timezone
                           OR NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
    NEW.next_run_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER report_schedules_prepare BEFORE INSERT OR UPDATE ON itap.report_schedules
  FOR EACH ROW EXECUTE FUNCTION itap.report_schedules_prepare();
CREATE TRIGGER report_schedules_set_updated_at BEFORE UPDATE ON itap.report_schedules
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.report_schedules
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change('ignore:last_run_at', 'ignore:next_run_at');
