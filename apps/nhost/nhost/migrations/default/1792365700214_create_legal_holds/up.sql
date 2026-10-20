-- Legal holds (spec §6.14; slice 10 task 1). A hold is active in [starts_at, ends_at) (ends_at NULL = open-ended);
-- a target names exactly one identity / profile / incident / facility. While active, a hold on an identity or profile
-- covers every row referencing it, and covers the other side of the identity <-> profile link (a held profile holds
-- its linked identities, a held identity holds its profile); a hold on an incident / facility covers rows
-- referencing it. Retention and erasure skip covered rows (task 2/3). Targets are NO ACTION: a held row cannot be
-- deleted from under its hold. Holds are not deleted (end them with ends_at); targets can be removed.
CREATE TABLE itap.legal_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  reason text NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_holds_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT legal_holds_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT legal_holds_reason_not_blank CHECK (btrim(reason) <> ''),
  CONSTRAINT legal_holds_period CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT legal_holds_created_by_fkey FOREIGN KEY (organization_id, created_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX legal_holds_organization_id_created_by_idx ON itap.legal_holds (organization_id, created_by);
CREATE INDEX legal_holds_organization_id_starts_at_idx ON itap.legal_holds (organization_id, starts_at);
CREATE TRIGGER legal_holds_set_updated_at BEFORE UPDATE ON itap.legal_holds
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.legal_holds
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

CREATE TABLE itap.legal_hold_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  hold_id uuid NOT NULL,
  identity_id uuid,
  profile_id uuid,
  incident_id uuid,
  facility_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_hold_targets_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT legal_hold_targets_exactly_one CHECK (num_nonnulls(identity_id, profile_id, incident_id, facility_id) = 1),
  CONSTRAINT legal_hold_targets_hold_fkey FOREIGN KEY (organization_id, hold_id)
    REFERENCES itap.legal_holds (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT legal_hold_targets_identity_fkey FOREIGN KEY (organization_id, identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT legal_hold_targets_profile_fkey FOREIGN KEY (organization_id, profile_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT legal_hold_targets_incident_fkey FOREIGN KEY (organization_id, incident_id)
    REFERENCES itap.incidents (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT legal_hold_targets_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id) ON DELETE NO ACTION
);
CREATE INDEX legal_hold_targets_organization_id_hold_id_idx ON itap.legal_hold_targets (organization_id, hold_id);
CREATE INDEX legal_hold_targets_organization_id_identity_id_idx ON itap.legal_hold_targets (organization_id, identity_id);
CREATE INDEX legal_hold_targets_organization_id_profile_id_idx ON itap.legal_hold_targets (organization_id, profile_id);
CREATE INDEX legal_hold_targets_organization_id_incident_id_idx ON itap.legal_hold_targets (organization_id, incident_id);
CREATE INDEX legal_hold_targets_organization_id_facility_id_idx ON itap.legal_hold_targets (organization_id, facility_id);
CREATE UNIQUE INDEX legal_hold_targets_identity_key ON itap.legal_hold_targets (organization_id, hold_id, identity_id) WHERE identity_id IS NOT NULL;
CREATE UNIQUE INDEX legal_hold_targets_profile_key ON itap.legal_hold_targets (organization_id, hold_id, profile_id) WHERE profile_id IS NOT NULL;
CREATE UNIQUE INDEX legal_hold_targets_incident_key ON itap.legal_hold_targets (organization_id, hold_id, incident_id) WHERE incident_id IS NOT NULL;
CREATE UNIQUE INDEX legal_hold_targets_facility_key ON itap.legal_hold_targets (organization_id, hold_id, facility_id) WHERE facility_id IS NOT NULL;
CREATE TRIGGER legal_hold_targets_set_updated_at BEFORE UPDATE ON itap.legal_hold_targets
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.legal_hold_targets
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

-- Coverage helpers (STABLE, internal: retention / DSR SQL). "Active at p_at": starts_at <= p_at < ends_at.
-- The identity <-> profile link is the current one (identities.profile_id).

-- Profiles held at p_at: direct profile targets plus the profiles of held identities.
CREATE FUNCTION itap.held_profile_ids(p_org uuid, p_at timestamptz) RETURNS SETOF uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT t.profile_id
  FROM itap.legal_hold_targets t
  JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
  WHERE t.organization_id = p_org AND t.profile_id IS NOT NULL
    AND h.starts_at <= p_at AND (h.ends_at IS NULL OR h.ends_at > p_at)
  UNION
  SELECT i.profile_id
  FROM itap.legal_hold_targets t
  JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
  JOIN itap.identities i ON i.organization_id = t.organization_id AND i.id = t.identity_id
  WHERE t.organization_id = p_org AND t.identity_id IS NOT NULL AND i.profile_id IS NOT NULL
    AND h.starts_at <= p_at AND (h.ends_at IS NULL OR h.ends_at > p_at);
$$;

-- Identities held at p_at: direct identity targets plus every identity linked to a held profile.
CREATE FUNCTION itap.held_identity_ids(p_org uuid, p_at timestamptz) RETURNS SETOF uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT t.identity_id
  FROM itap.legal_hold_targets t
  JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
  WHERE t.organization_id = p_org AND t.identity_id IS NOT NULL
    AND h.starts_at <= p_at AND (h.ends_at IS NULL OR h.ends_at > p_at)
  UNION
  SELECT i.id
  FROM itap.held_profile_ids(p_org, p_at) hp (profile_id)
  JOIN itap.identities i ON i.organization_id = p_org AND i.profile_id = hp.profile_id;
$$;

CREATE FUNCTION itap.legal_hold_covers_profile(p_org uuid, p_profile uuid, p_at timestamptz) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT p_profile IS NOT NULL AND EXISTS (
    SELECT 1 FROM itap.legal_hold_targets t
    JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
    LEFT JOIN itap.identities i ON i.organization_id = t.organization_id AND i.id = t.identity_id
    WHERE t.organization_id = p_org
      AND (t.profile_id = p_profile OR (t.identity_id IS NOT NULL AND i.profile_id = p_profile))
      AND h.starts_at <= p_at AND (h.ends_at IS NULL OR h.ends_at > p_at)
  );
$$;

CREATE FUNCTION itap.legal_hold_covers_identity(p_org uuid, p_identity uuid, p_at timestamptz) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT p_identity IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM itap.legal_hold_targets t
      JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
      WHERE t.organization_id = p_org AND t.identity_id = p_identity
        AND h.starts_at <= p_at AND (h.ends_at IS NULL OR h.ends_at > p_at))
    OR itap.legal_hold_covers_profile(
      p_org, (SELECT i.profile_id FROM itap.identities i WHERE i.organization_id = p_org AND i.id = p_identity), p_at)
  );
$$;

CREATE FUNCTION itap.legal_hold_covers_incident(p_org uuid, p_incident uuid, p_at timestamptz) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT p_incident IS NOT NULL AND EXISTS (
    SELECT 1 FROM itap.legal_hold_targets t
    JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
    WHERE t.organization_id = p_org AND t.incident_id = p_incident
      AND h.starts_at <= p_at AND (h.ends_at IS NULL OR h.ends_at > p_at)
  );
$$;

CREATE FUNCTION itap.legal_hold_covers_facility(p_org uuid, p_facility uuid, p_at timestamptz) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT p_facility IS NOT NULL AND EXISTS (
    SELECT 1 FROM itap.legal_hold_targets t
    JOIN itap.legal_holds h ON h.organization_id = t.organization_id AND h.id = t.hold_id
    WHERE t.organization_id = p_org AND t.facility_id = p_facility
      AND h.starts_at <= p_at AND (h.ends_at IS NULL OR h.ends_at > p_at)
  );
$$;
