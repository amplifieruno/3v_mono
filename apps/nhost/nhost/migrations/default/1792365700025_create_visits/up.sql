-- Visits (spec §6.2): a visitor profile (profile_type visitor) is expected by a host profile of a company, optionally
-- at one facility, between expected_start and expected_end. Code VISIT-xxxxx.
-- status: scheduled -> checked_in | cancelled | no_show;  checked_in -> checked_out;  checked_out, cancelled and
-- no_show are terminal (trigger visits_validate_transition, applies to every writer). status, checked_in_at,
-- checked_out_at and cancellation_reason change only through check_in_visit / check_out_visit / cancel_visit (next
-- migration) and the lifecycle cron (no_show); they are read-only for org_admin in metadata.
-- visitor_profile_id must reference a visitor profile and host_profile_id must not (trigger visits_validate_profiles).
-- facility_id is optional: Stage A links a session to a visit only when the visit has no facility or the same one.
-- Visits are history: status instead of deletion. tracking_sessions.visit_id gets its composite FK here
-- (SET NULL (visit_id)); the covering index (organization_id, visit_id) exists since the tracking tables.
CREATE TABLE itap.visit_statuses (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.visit_statuses (value, description) VALUES
  ('scheduled', 'Expected, not arrived yet'),
  ('checked_in', 'Visitor is on site'),
  ('checked_out', 'Visitor has left'),
  ('cancelled', 'Cancelled before arrival'),
  ('no_show', 'Visitor never arrived');

CREATE TABLE itap.visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  number bigint NOT NULL,
  code text GENERATED ALWAYS AS ('VISIT-' || lpad(number::text, 5, '0')) STORED,
  visitor_profile_id uuid NOT NULL,
  host_profile_id uuid,
  company_id uuid,
  facility_id uuid,
  purpose text,
  expected_start timestamptz NOT NULL,
  expected_end timestamptz NOT NULL,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled' REFERENCES itap.visit_statuses (value),
  badge_number text,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visits_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT visits_organization_id_number_key UNIQUE (organization_id, number),
  CONSTRAINT visits_organization_id_code_key UNIQUE (organization_id, code),
  CONSTRAINT visits_visitor_profile_fkey FOREIGN KEY (organization_id, visitor_profile_id)
    REFERENCES itap.profiles (organization_id, id),
  CONSTRAINT visits_host_profile_fkey FOREIGN KEY (organization_id, host_profile_id)
    REFERENCES itap.profiles (organization_id, id),
  CONSTRAINT visits_company_fkey FOREIGN KEY (organization_id, company_id)
    REFERENCES itap.companies (organization_id, id),
  CONSTRAINT visits_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id),
  CONSTRAINT visits_expected_range CHECK (expected_end > expected_start),
  CONSTRAINT visits_checked_out_after_in CHECK (checked_out_at IS NULL OR checked_in_at IS NULL OR checked_out_at >= checked_in_at),
  CONSTRAINT visits_status_timestamps CHECK (
    (status NOT IN ('checked_in', 'checked_out') OR checked_in_at IS NOT NULL)
    AND (status <> 'checked_out' OR checked_out_at IS NOT NULL)
  )
);

CREATE INDEX visits_organization_id_visitor_profile_id_idx ON itap.visits (organization_id, visitor_profile_id);
CREATE INDEX visits_organization_id_host_profile_id_idx ON itap.visits (organization_id, host_profile_id);
CREATE INDEX visits_organization_id_company_id_idx ON itap.visits (organization_id, company_id);
CREATE INDEX visits_organization_id_facility_id_idx ON itap.visits (organization_id, facility_id);
CREATE INDEX visits_organization_id_status_expected_start_idx ON itap.visits (organization_id, status, expected_start);

CREATE FUNCTION itap.visits_validate_profiles() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.visitor_profile_id IS DISTINCT FROM OLD.visitor_profile_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM itap.profiles p
      WHERE p.organization_id = NEW.organization_id AND p.id = NEW.visitor_profile_id AND p.profile_type = 'visitor'
    ) THEN
      PERFORM itap.raise_code('visit_visitor_not_visitor');
    END IF;
  END IF;
  IF NEW.host_profile_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.host_profile_id IS DISTINCT FROM OLD.host_profile_id) THEN
    IF EXISTS (
      SELECT 1 FROM itap.profiles p
      WHERE p.organization_id = NEW.organization_id AND p.id = NEW.host_profile_id AND p.profile_type = 'visitor'
    ) THEN
      PERFORM itap.raise_code('visit_host_is_visitor');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION itap.visit_transition_allowed(p_from text, p_to text) RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT (p_from = 'scheduled' AND p_to IN ('checked_in', 'cancelled', 'no_show'))
      OR (p_from = 'checked_in' AND p_to = 'checked_out');
$$;

CREATE FUNCTION itap.visits_validate_transition() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT itap.visit_transition_allowed(OLD.status, NEW.status) THEN
    PERFORM itap.raise_code('visit_invalid_transition');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER visits_number BEFORE INSERT ON itap.visits
  FOR EACH ROW EXECUTE FUNCTION itap.assign_number('visit');
CREATE TRIGGER visits_set_updated_at BEFORE UPDATE ON itap.visits
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER visits_validate_profiles BEFORE INSERT OR UPDATE OF visitor_profile_id, host_profile_id ON itap.visits
  FOR EACH ROW EXECUTE FUNCTION itap.visits_validate_profiles();
CREATE TRIGGER visits_validate_transition BEFORE UPDATE OF status ON itap.visits
  FOR EACH ROW EXECUTE FUNCTION itap.visits_validate_transition();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.visits
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

ALTER TABLE itap.tracking_sessions
  ADD CONSTRAINT tracking_sessions_visit_fkey FOREIGN KEY (organization_id, visit_id)
    REFERENCES itap.visits (organization_id, id) ON DELETE SET NULL (visit_id);
