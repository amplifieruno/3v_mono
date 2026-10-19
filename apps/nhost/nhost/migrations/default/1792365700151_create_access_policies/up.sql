-- Access policies (spec §6.13, SA_5 §2.1.4): a versioned entity (spec §6.0; helpers in *_create_versioning_helpers,
-- same shape as event rules) with an approval workflow on the version:
--   header   access_policies (code POL-xxxxx; current_version_id / is_archived read-only: approval and
--            archive_access_policy write them; enforced = current_version_id set and not archived);
--   versions access_policy_versions (effect, priority, schedule windows, validity, max_risk; status draft ->
--            pending_approval (submit) -> published (approve by a different member) | draft (reject));
--   children access_policy_version_subjects (exactly one of profile / segment / profile_type / access_level) and
--            access_policy_version_targets (exactly one of facility / area (subtree) / access point).
-- Status and approval columns change only inside the approval functions (transaction-local flag
-- itap.access_approval_context; published/superseded via itap.version_context as for every versioned entity).
-- A pending version is frozen (content and children) so the approver approves exactly what was submitted.
-- No direct republish: a rollback is a new draft copied from the superseded version, submitted and approved again.

-- Access points are referenced across facilities by policy targets and grants: (organization_id, id) key.
ALTER TABLE itap.access_points ADD CONSTRAINT access_points_organization_id_id_key UNIQUE (organization_id, id);

CREATE TABLE itap.access_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  number bigint NOT NULL,
  code text GENERATED ALWAYS AS ('POL-' || lpad(number::text, 5, '0')) STORED,
  name text NOT NULL,
  description text,
  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  archived_by uuid,
  current_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_policies_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT access_policies_organization_id_number_key UNIQUE (organization_id, number),
  CONSTRAINT access_policies_organization_id_code_key UNIQUE (organization_id, code),
  CONSTRAINT access_policies_organization_id_name_key UNIQUE (organization_id, name),
  CONSTRAINT access_policies_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT access_policies_archived_not_enforced CHECK (NOT is_archived OR current_version_id IS NULL),
  CONSTRAINT access_policies_archived_consistent CHECK (is_archived = (archived_at IS NOT NULL)),
  CONSTRAINT access_policies_archived_by_fkey FOREIGN KEY (organization_id, archived_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX access_policies_organization_id_current_version_id_idx ON itap.access_policies (organization_id, current_version_id);
CREATE INDEX access_policies_organization_id_archived_by_idx ON itap.access_policies (organization_id, archived_by);

CREATE TABLE itap.access_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  policy_id uuid NOT NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' REFERENCES itap.version_statuses (value),
  effect text NOT NULL DEFAULT 'allow' REFERENCES itap.access_effects (value),
  -- Higher first; equal priority: deny before allow, then version id (deterministic).
  priority integer NOT NULL DEFAULT 100,
  -- Wall-clock windows in the target facility's timezone (itap.in_windows); NULL or [] = always.
  schedule jsonb,
  valid_from timestamptz,
  valid_until timestamptz,
  -- Above this risk score (0..1) an allow of this version becomes a deny (risk_exceeded); NULL = no limit.
  max_risk numeric(4, 3),
  submitted_by uuid,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  rejected_by uuid,
  rejected_at timestamptz,
  published_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_policy_versions_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT access_policy_versions_organization_id_policy_id_version_key UNIQUE (organization_id, policy_id, version),
  CONSTRAINT access_policy_versions_version_positive CHECK (version > 0),
  CONSTRAINT access_policy_versions_priority_range CHECK (priority BETWEEN 0 AND 1000),
  CONSTRAINT access_policy_versions_schedule_valid CHECK (schedule IS NULL OR itap.valid_windows(schedule)),
  CONSTRAINT access_policy_versions_valid_window CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from < valid_until),
  CONSTRAINT access_policy_versions_max_risk_range CHECK (max_risk IS NULL OR max_risk BETWEEN 0 AND 1),
  CONSTRAINT access_policy_versions_published_consistent CHECK (
    status NOT IN ('published', 'superseded') OR (published_at IS NOT NULL AND approved_at IS NOT NULL)
  ),
  CONSTRAINT access_policy_versions_submitted_consistent CHECK (
    status <> 'pending_approval' OR submitted_at IS NOT NULL
  ),
  CONSTRAINT access_policy_versions_four_eyes CHECK (approved_by IS NULL OR approved_by IS DISTINCT FROM submitted_by),
  CONSTRAINT access_policy_versions_policy_fkey FOREIGN KEY (organization_id, policy_id)
    REFERENCES itap.access_policies (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT access_policy_versions_submitted_by_fkey FOREIGN KEY (organization_id, submitted_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT access_policy_versions_approved_by_fkey FOREIGN KEY (organization_id, approved_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT access_policy_versions_rejected_by_fkey FOREIGN KEY (organization_id, rejected_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT access_policy_versions_published_by_fkey FOREIGN KEY (organization_id, published_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX access_policy_versions_organization_id_status_idx ON itap.access_policy_versions (organization_id, status);
CREATE INDEX access_policy_versions_organization_id_effect_idx ON itap.access_policy_versions (organization_id, effect);
CREATE INDEX access_policy_versions_organization_id_submitted_by_idx ON itap.access_policy_versions (organization_id, submitted_by);
CREATE INDEX access_policy_versions_organization_id_approved_by_idx ON itap.access_policy_versions (organization_id, approved_by);
CREATE INDEX access_policy_versions_organization_id_rejected_by_idx ON itap.access_policy_versions (organization_id, rejected_by);
CREATE INDEX access_policy_versions_organization_id_published_by_idx ON itap.access_policy_versions (organization_id, published_by);
CREATE UNIQUE INDEX access_policy_versions_one_published_key ON itap.access_policy_versions (organization_id, policy_id)
  WHERE status = 'published';
CREATE UNIQUE INDEX access_policy_versions_one_open_key ON itap.access_policy_versions (organization_id, policy_id)
  WHERE status IN ('draft', 'pending_approval');

ALTER TABLE itap.access_policies ADD CONSTRAINT access_policies_current_version_fkey FOREIGN KEY (organization_id, current_version_id)
  REFERENCES itap.access_policy_versions (organization_id, id) ON DELETE NO ACTION;

CREATE TABLE itap.access_policy_version_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  version_id uuid NOT NULL,
  profile_id uuid,
  -- Membership at decision time (identity or profile segments).
  segment_id uuid,
  profile_type text REFERENCES itap.profile_types (value),
  -- Minimum clearance: matches profiles with itap.access_rank(profile.access_level) >= itap.access_rank(access_level).
  access_level text REFERENCES itap.access_levels (value),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_policy_version_subjects_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT access_policy_version_subjects_exactly_one_subject CHECK (
    num_nonnulls(profile_id, segment_id, profile_type, access_level) = 1
  ),
  CONSTRAINT access_policy_version_subjects_version_fkey FOREIGN KEY (organization_id, version_id)
    REFERENCES itap.access_policy_versions (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT access_policy_version_subjects_profile_fkey FOREIGN KEY (organization_id, profile_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT access_policy_version_subjects_segment_fkey FOREIGN KEY (organization_id, segment_id)
    REFERENCES itap.segments (organization_id, id) ON DELETE NO ACTION
);
CREATE INDEX access_policy_version_subjects_organization_id_version_id_idx
  ON itap.access_policy_version_subjects (organization_id, version_id);
CREATE INDEX access_policy_version_subjects_organization_id_profile_id_idx
  ON itap.access_policy_version_subjects (organization_id, profile_id);
CREATE INDEX access_policy_version_subjects_organization_id_segment_id_idx
  ON itap.access_policy_version_subjects (organization_id, segment_id);
CREATE INDEX access_policy_version_subjects_organization_id_profile_type_idx
  ON itap.access_policy_version_subjects (organization_id, profile_type);
CREATE INDEX access_policy_version_subjects_organization_id_access_level_idx
  ON itap.access_policy_version_subjects (organization_id, access_level);
CREATE UNIQUE INDEX access_policy_version_subjects_profile_key ON itap.access_policy_version_subjects (organization_id, version_id, profile_id)
  WHERE profile_id IS NOT NULL;
CREATE UNIQUE INDEX access_policy_version_subjects_segment_key ON itap.access_policy_version_subjects (organization_id, version_id, segment_id)
  WHERE segment_id IS NOT NULL;
CREATE UNIQUE INDEX access_policy_version_subjects_profile_type_key
  ON itap.access_policy_version_subjects (organization_id, version_id, profile_type) WHERE profile_type IS NOT NULL;
CREATE UNIQUE INDEX access_policy_version_subjects_access_level_key
  ON itap.access_policy_version_subjects (organization_id, version_id, access_level) WHERE access_level IS NOT NULL;

CREATE TABLE itap.access_policy_version_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  version_id uuid NOT NULL,
  facility_id uuid,
  -- The area and its subtree.
  area_id uuid,
  access_point_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_policy_version_targets_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT access_policy_version_targets_exactly_one_target CHECK (num_nonnulls(facility_id, area_id, access_point_id) = 1),
  CONSTRAINT access_policy_version_targets_version_fkey FOREIGN KEY (organization_id, version_id)
    REFERENCES itap.access_policy_versions (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT access_policy_version_targets_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT access_policy_version_targets_area_fkey FOREIGN KEY (organization_id, area_id)
    REFERENCES itap.areas (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT access_policy_version_targets_access_point_fkey FOREIGN KEY (organization_id, access_point_id)
    REFERENCES itap.access_points (organization_id, id) ON DELETE NO ACTION
);
CREATE INDEX access_policy_version_targets_organization_id_version_id_idx
  ON itap.access_policy_version_targets (organization_id, version_id);
CREATE INDEX access_policy_version_targets_organization_id_facility_id_idx
  ON itap.access_policy_version_targets (organization_id, facility_id);
CREATE INDEX access_policy_version_targets_organization_id_area_id_idx
  ON itap.access_policy_version_targets (organization_id, area_id);
CREATE INDEX access_policy_version_targets_organization_id_access_point_id_idx
  ON itap.access_policy_version_targets (organization_id, access_point_id);
CREATE UNIQUE INDEX access_policy_version_targets_facility_key ON itap.access_policy_version_targets (organization_id, version_id, facility_id)
  WHERE facility_id IS NOT NULL;
CREATE UNIQUE INDEX access_policy_version_targets_area_key ON itap.access_policy_version_targets (organization_id, version_id, area_id)
  WHERE area_id IS NOT NULL;
CREATE UNIQUE INDEX access_policy_version_targets_access_point_key
  ON itap.access_policy_version_targets (organization_id, version_id, access_point_id) WHERE access_point_id IS NOT NULL;

-- Approval guard (in addition to itap.guard_version_status): new versions never carry approval data (a copied
-- draft starts clean) and are never inserted into an archived policy; draft <-> pending_approval and the approval
-- columns change only inside the approval functions; a pending version's content is frozen.
CREATE FUNCTION itap.guard_access_policy_version() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  in_approval boolean := coalesce(current_setting('itap.access_approval_context', true), '') = 'on';
  meta text[] := ARRAY['submitted_by', 'submitted_at', 'approved_by', 'approved_at', 'rejection_reason', 'rejected_by',
                       'rejected_at', 'status', 'published_by', 'published_at', 'updated_at'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM itap.access_policies p
               WHERE p.organization_id = NEW.organization_id AND p.id = NEW.policy_id AND p.is_archived) THEN
      PERFORM itap.raise_code('access_policy_archived');
    END IF;
    IF NEW.status = 'pending_approval' THEN
      PERFORM itap.raise_code('version_status_reserved');
    END IF;
    NEW.submitted_by := NULL; NEW.submitted_at := NULL;
    NEW.approved_by := NULL; NEW.approved_at := NULL;
    NEW.rejection_reason := NULL; NEW.rejected_by := NULL; NEW.rejected_at := NULL;
    RETURN NEW;
  END IF;
  IF NOT in_approval THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND 'pending_approval' IN (NEW.status, OLD.status) THEN
      PERFORM itap.raise_code('version_status_reserved');
    END IF;
    IF (NEW.submitted_by, NEW.submitted_at, NEW.approved_by, NEW.approved_at, NEW.rejection_reason, NEW.rejected_by,
        NEW.rejected_at)
       IS DISTINCT FROM (OLD.submitted_by, OLD.submitted_at, OLD.approved_by, OLD.approved_at, OLD.rejection_reason,
        OLD.rejected_by, OLD.rejected_at) THEN
      PERFORM itap.raise_code('access_policy_approval_reserved');
    END IF;
  END IF;
  IF OLD.status = 'pending_approval' AND NEW.status = 'pending_approval'
     AND (to_jsonb(NEW) - meta) IS DISTINCT FROM (to_jsonb(OLD) - meta) THEN
    PERFORM itap.raise_code('access_policy_version_pending');
  END IF;
  RETURN NEW;
END;
$$;

-- Children of a pending version are frozen too (itap.guard_version_children already freezes published ones).
CREATE FUNCTION itap.guard_access_policy_children() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  r record;
  org uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
BEGIN
  -- Organization cascade: nothing to guard.
  IF NOT EXISTS (SELECT 1 FROM itap.organizations o WHERE o.id = org) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  FOR r IN
    SELECT v.status FROM itap.access_policy_versions v
    WHERE (TG_OP <> 'DELETE' AND v.organization_id = NEW.organization_id AND v.id = NEW.version_id)
       OR (TG_OP <> 'INSERT' AND v.organization_id = OLD.organization_id AND v.id = OLD.version_id)
  LOOP
    IF r.status = 'pending_approval' THEN
      PERFORM itap.raise_code('access_policy_version_pending');
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER access_policies_number BEFORE INSERT ON itap.access_policies
  FOR EACH ROW EXECUTE FUNCTION itap.assign_number('access_policy');
CREATE TRIGGER access_policies_set_updated_at BEFORE UPDATE ON itap.access_policies
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.access_policies
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

CREATE TRIGGER access_policy_versions_guard_approval BEFORE INSERT OR UPDATE ON itap.access_policy_versions
  FOR EACH ROW EXECUTE FUNCTION itap.guard_access_policy_version();
CREATE TRIGGER access_policy_versions_guard_status BEFORE INSERT OR UPDATE ON itap.access_policy_versions
  FOR EACH ROW EXECUTE FUNCTION itap.guard_version_status();
CREATE TRIGGER access_policy_versions_number BEFORE INSERT ON itap.access_policy_versions
  FOR EACH ROW EXECUTE FUNCTION itap.assign_version_number('policy_id', 'itap.access_policies');
CREATE TRIGGER access_policy_versions_set_updated_at BEFORE UPDATE ON itap.access_policy_versions
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.access_policy_versions
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

CREATE TRIGGER access_policy_version_subjects_guard BEFORE INSERT OR UPDATE OR DELETE ON itap.access_policy_version_subjects
  FOR EACH ROW EXECUTE FUNCTION itap.guard_version_children('version_id', 'itap.access_policy_versions');
CREATE TRIGGER access_policy_version_subjects_guard_pending BEFORE INSERT OR UPDATE OR DELETE ON itap.access_policy_version_subjects
  FOR EACH ROW EXECUTE FUNCTION itap.guard_access_policy_children();
CREATE TRIGGER access_policy_version_subjects_set_updated_at BEFORE UPDATE ON itap.access_policy_version_subjects
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.access_policy_version_subjects
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

CREATE TRIGGER access_policy_version_targets_guard BEFORE INSERT OR UPDATE OR DELETE ON itap.access_policy_version_targets
  FOR EACH ROW EXECUTE FUNCTION itap.guard_version_children('version_id', 'itap.access_policy_versions');
CREATE TRIGGER access_policy_version_targets_guard_pending BEFORE INSERT OR UPDATE OR DELETE ON itap.access_policy_version_targets
  FOR EACH ROW EXECUTE FUNCTION itap.guard_access_policy_children();
CREATE TRIGGER access_policy_version_targets_set_updated_at BEFORE UPDATE ON itap.access_policy_version_targets
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.access_policy_version_targets
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
