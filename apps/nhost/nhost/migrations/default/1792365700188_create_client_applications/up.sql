-- Client applications of the face authentication service (spec §6.16, SA_6 §2.1.6): registration, the population
-- they may authenticate against (segments ∪ facilities, narrowed by access points), allowed modes and the
-- attributes they may receive. Thresholds are cosine similarities in 0..1 (threshold_min <= threshold <= threshold_max).
-- is_sandbox is fixed at insert. A sandbox app sees only is_synthetic identities, a production app never does
-- (population filter of the decision engine, slice 9 task 2); production matching paths (match_face: camera
-- recognition, enrollment duplicate checks) exclude synthetic identities (migration 1792365700194). Sandbox apps
-- cannot bind facilities or access points (trigger below).
CREATE TABLE itap.client_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  number bigint NOT NULL,
  code text GENERATED ALWAYS AS ('APP-' || lpad(number::text, 5, '0')) STORED,
  name text NOT NULL,
  description text,
  platform text NOT NULL REFERENCES itap.client_application_platforms (value),
  status text NOT NULL DEFAULT 'active' REFERENCES itap.client_application_statuses (value),
  threshold numeric(4, 3) NOT NULL DEFAULT 0.600,
  threshold_min numeric(4, 3) NOT NULL DEFAULT 0.500,
  threshold_max numeric(4, 3) NOT NULL DEFAULT 0.900,
  liveness_required boolean NOT NULL DEFAULT true,
  use_work_schedules boolean NOT NULL DEFAULT false,
  is_sandbox boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_applications_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT client_applications_organization_id_number_key UNIQUE (organization_id, number),
  CONSTRAINT client_applications_organization_id_code_key UNIQUE (organization_id, code),
  CONSTRAINT client_applications_organization_id_name_key UNIQUE (organization_id, name),
  CONSTRAINT client_applications_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT client_applications_threshold_range
    CHECK (0 <= threshold_min AND threshold_min <= threshold AND threshold <= threshold_max AND threshold_max <= 1),
  CONSTRAINT client_applications_created_by_fkey FOREIGN KEY (organization_id, created_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX client_applications_organization_id_platform_idx ON itap.client_applications (organization_id, platform);
CREATE INDEX client_applications_organization_id_status_idx ON itap.client_applications (organization_id, status);
CREATE INDEX client_applications_organization_id_created_by_idx ON itap.client_applications (organization_id, created_by);

-- is_sandbox never changes (a production app with bindings must not turn into a sandbox or back); revoked is terminal.
CREATE FUNCTION itap.guard_client_application() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF NEW.is_sandbox IS DISTINCT FROM OLD.is_sandbox THEN
    PERFORM itap.raise_code('client_application_sandbox_immutable');
  END IF;
  IF OLD.status = 'revoked' AND NEW.status <> 'revoked' THEN
    PERFORM itap.raise_code('client_application_revoked');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER client_applications_guard BEFORE UPDATE ON itap.client_applications
  FOR EACH ROW EXECUTE FUNCTION itap.guard_client_application();
CREATE TRIGGER client_applications_number BEFORE INSERT ON itap.client_applications
  FOR EACH ROW EXECUTE FUNCTION itap.assign_number('client_application');
CREATE TRIGGER client_applications_set_updated_at BEFORE UPDATE ON itap.client_applications
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.client_applications
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

-- Allowed modes and attributes (enum sets as junctions, spec §6.0).
CREATE TABLE itap.client_application_modes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  application_id uuid NOT NULL,
  mode text NOT NULL REFERENCES itap.auth_modes (value),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_application_modes_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT client_application_modes_key UNIQUE (organization_id, application_id, mode),
  CONSTRAINT client_application_modes_application_fkey FOREIGN KEY (organization_id, application_id)
    REFERENCES itap.client_applications (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX client_application_modes_organization_id_mode_idx ON itap.client_application_modes (organization_id, mode);

CREATE TABLE itap.client_application_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  application_id uuid NOT NULL,
  attribute text NOT NULL REFERENCES itap.auth_attributes (value),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_application_attributes_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT client_application_attributes_key UNIQUE (organization_id, application_id, attribute),
  CONSTRAINT client_application_attributes_application_fkey FOREIGN KEY (organization_id, application_id)
    REFERENCES itap.client_applications (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX client_application_attributes_organization_id_attribute_idx
  ON itap.client_application_attributes (organization_id, attribute);

-- Bound population and locations. Targets are NO ACTION: a referenced segment / facility / access point is
-- archived, not deleted, so a binding never disappears silently (removing an access point narrowing would widen
-- the population).
CREATE TABLE itap.client_application_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  application_id uuid NOT NULL,
  segment_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_application_segments_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT client_application_segments_key UNIQUE (organization_id, application_id, segment_id),
  CONSTRAINT client_application_segments_application_fkey FOREIGN KEY (organization_id, application_id)
    REFERENCES itap.client_applications (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT client_application_segments_segment_fkey FOREIGN KEY (organization_id, segment_id)
    REFERENCES itap.segments (organization_id, id) ON DELETE NO ACTION
);
CREATE INDEX client_application_segments_organization_id_segment_id_idx
  ON itap.client_application_segments (organization_id, segment_id);

CREATE TABLE itap.client_application_facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  application_id uuid NOT NULL,
  facility_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_application_facilities_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT client_application_facilities_key UNIQUE (organization_id, application_id, facility_id),
  CONSTRAINT client_application_facilities_application_fkey FOREIGN KEY (organization_id, application_id)
    REFERENCES itap.client_applications (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT client_application_facilities_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id) ON DELETE NO ACTION
);
CREATE INDEX client_application_facilities_organization_id_facility_id_idx
  ON itap.client_application_facilities (organization_id, facility_id);

CREATE TABLE itap.client_application_access_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  application_id uuid NOT NULL,
  access_point_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_application_access_points_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT client_application_access_points_key UNIQUE (organization_id, application_id, access_point_id),
  CONSTRAINT client_application_access_points_application_fkey FOREIGN KEY (organization_id, application_id)
    REFERENCES itap.client_applications (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT client_application_access_points_access_point_fkey FOREIGN KEY (organization_id, access_point_id)
    REFERENCES itap.access_points (organization_id, id) ON DELETE NO ACTION
);
CREATE INDEX client_application_access_points_organization_id_access_point_id_idx
  ON itap.client_application_access_points (organization_id, access_point_id);

-- sandbox_population_check (spec §8.1): a sandbox application authenticates only synthetic identities, which have
-- no profile (CHECK identities_synthetic_unlinked) and are never matched by cameras (match_face excludes them), so
-- it may bind segments (filtered to synthetic identities by the engine) but no facilities or access points.
CREATE FUNCTION itap.sandbox_population_check() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM itap.client_applications a
    WHERE a.organization_id = NEW.organization_id AND a.id = NEW.application_id AND a.is_sandbox
  ) THEN
    PERFORM itap.raise_code('sandbox_location_binding');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER client_application_facilities_sandbox BEFORE INSERT OR UPDATE ON itap.client_application_facilities
  FOR EACH ROW EXECUTE FUNCTION itap.sandbox_population_check();
CREATE TRIGGER client_application_access_points_sandbox BEFORE INSERT OR UPDATE ON itap.client_application_access_points
  FOR EACH ROW EXECUTE FUNCTION itap.sandbox_population_check();

CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.client_application_modes
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.client_application_attributes
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.client_application_segments
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.client_application_facilities
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.client_application_access_points
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();
