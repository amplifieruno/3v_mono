-- Segments (spec §6.5): logical groups of identities or profiles, manual or dynamic (conditions), plus templates.
-- conditions: the segment condition language (validated by itap.validate_segment_conditions, migration
-- *_create_segment_conditions); '{}' for manual segments, a non-empty tree for dynamic ones.
-- kind and target are fixed at creation (guard trigger): a referenced manual segment can never turn dynamic, so
-- evaluation cycles stay impossible, and members always match the segment target.
-- schedule: wall-clock windows (itap.valid_windows) in the organization timezone; active_from/active_until bound
-- when the segment is evaluated at all. member_count and last_evaluated_at are system-maintained (ro).

-- Reusable condition sets (configuration). is_system rows are seeded and read-only for org_admin.
CREATE TABLE itap.segment_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  target text NOT NULL REFERENCES itap.segment_targets (value),
  conditions jsonb NOT NULL,
  category text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT segment_templates_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT segment_templates_organization_id_name_key UNIQUE (organization_id, name),
  CONSTRAINT segment_templates_name_not_blank CHECK (btrim(name) <> '')
);
CREATE INDEX segment_templates_organization_id_target_idx ON itap.segment_templates (organization_id, target);
CREATE TRIGGER segment_templates_set_updated_at BEFORE UPDATE ON itap.segment_templates
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.segment_templates
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

CREATE TABLE itap.segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  number bigint NOT NULL,
  code text GENERATED ALWAYS AS ('SEGMENT-' || lpad(number::text, 5, '0')) STORED,
  name text NOT NULL,
  description text,
  -- '#rrggbb'
  color text,
  icon text,
  kind text NOT NULL DEFAULT 'manual' REFERENCES itap.segment_kinds (value),
  target text NOT NULL REFERENCES itap.segment_targets (value),
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' REFERENCES itap.segment_statuses (value),
  active_from timestamptz,
  active_until timestamptz,
  schedule jsonb,
  member_count integer NOT NULL DEFAULT 0,
  last_evaluated_at timestamptz,
  template_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT segments_organization_id_id_key UNIQUE (organization_id, id),
  -- Target of segment_members' FK: a member row's target always equals its segment's target.
  CONSTRAINT segments_organization_id_id_target_key UNIQUE (organization_id, id, target),
  CONSTRAINT segments_organization_id_number_key UNIQUE (organization_id, number),
  CONSTRAINT segments_organization_id_code_key UNIQUE (organization_id, code),
  CONSTRAINT segments_organization_id_name_key UNIQUE (organization_id, name),
  CONSTRAINT segments_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT segments_color_hex CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$'),
  CONSTRAINT segments_conditions_match_kind CHECK ((kind = 'manual') = (conditions = '{}'::jsonb)),
  CONSTRAINT segments_active_window_ordered CHECK (active_from IS NULL OR active_until IS NULL OR active_until > active_from),
  CONSTRAINT segments_schedule_valid CHECK (schedule IS NULL OR itap.valid_windows(schedule)),
  CONSTRAINT segments_member_count_nonnegative CHECK (member_count >= 0),
  CONSTRAINT segments_template_fkey FOREIGN KEY (organization_id, template_id)
    REFERENCES itap.segment_templates (organization_id, id) ON DELETE SET NULL (template_id)
);
CREATE INDEX segments_organization_id_kind_idx ON itap.segments (organization_id, kind);
CREATE INDEX segments_organization_id_target_idx ON itap.segments (organization_id, target);
CREATE INDEX segments_organization_id_status_idx ON itap.segments (organization_id, status);
CREATE INDEX segments_organization_id_template_id_idx ON itap.segments (organization_id, template_id);
CREATE TRIGGER segments_number BEFORE INSERT ON itap.segments
  FOR EACH ROW EXECUTE FUNCTION itap.assign_number('segment');
CREATE TRIGGER segments_set_updated_at BEFORE UPDATE ON itap.segments
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at_except('member_count', 'last_evaluated_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.segments
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change('ignore:member_count', 'ignore:last_evaluated_at');

CREATE FUNCTION itap.segments_fixed_kind() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF NEW.kind IS DISTINCT FROM OLD.kind THEN
    PERFORM itap.raise_code('segment_kind_immutable');
  END IF;
  IF NEW.target IS DISTINCT FROM OLD.target THEN
    PERFORM itap.raise_code('segment_target_immutable');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER segments_fixed_kind BEFORE UPDATE OF kind, target ON itap.segments
  FOR EACH ROW EXECUTE FUNCTION itap.segments_fixed_kind();
