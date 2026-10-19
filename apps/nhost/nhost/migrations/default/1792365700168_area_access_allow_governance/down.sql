-- Restores area_access_allowed of 1792365700165_access_matching_helpers.
-- Policy-based area authorization (Stage B restricted_area_entry, spec 8.2): is the person authorized to be in the
-- area at p_at? Evaluated like evaluate_access steps (2)-(3) for the area instead of a door, without overrides and
-- without risk:
--   NULL  = no enforced version covers the area (any subject) and no grant of the person covers it: the area is not
--           governed by policy (the caller falls back to the access-rank comparison);
--   false = no person (neither identity nor profile), a profile that is not active, the first fully matching version
--           (priority desc, deny first, id) denies, or nothing allows;
--   true  = the first fully matching version allows, or (no version decided) a grant of the profile not revoked at
--           p_at, valid at p_at, for an area on the area's path or an access point leading into it. Single-use grants
--           count for their whole window (consumption happens at the door, not in the area).
-- Schedules use the area's facility timezone. p_identity is resolved to its effective identity and linked profile.
CREATE OR REPLACE FUNCTION itap.area_access_allowed(p_org uuid, p_area uuid, p_identity uuid, p_profile uuid, p_at timestamptz)
RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  ar itap.areas;
  tz text;
  ident uuid;
  prof itap.profiles;
  has_profile boolean := false;
  governed boolean;
  cand record;
BEGIN
  SELECT * INTO ar FROM itap.areas a WHERE a.organization_id = p_org AND a.id = p_area;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM itap.access_policies p
    WHERE p.organization_id = p_org AND NOT p.is_archived AND p.current_version_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM itap.access_target_match(p_org, p.current_version_id, ar.facility_id, ar.path, NULL))
  ) INTO governed;

  IF p_identity IS NOT NULL THEN
    ident := itap.effective_identity(p_org, p_identity);
  END IF;
  SELECT * INTO prof FROM itap.profiles p
  WHERE p.organization_id = p_org
    AND p.id = coalesce((SELECT i.profile_id FROM itap.identities i WHERE i.organization_id = p_org AND i.id = ident),
                        p_profile);
  has_profile := FOUND;

  IF has_profile AND prof.status <> 'active' THEN
    RETURN CASE WHEN governed THEN false END;
  END IF;
  IF ident IS NULL AND NOT has_profile THEN
    RETURN CASE WHEN governed THEN false END;
  END IF;

  IF governed THEN
    SELECT f.timezone INTO tz FROM itap.facilities f WHERE f.organization_id = p_org AND f.id = ar.facility_id;
    FOR cand IN
      SELECT c.effect FROM itap.access_candidates(
        p_org, CASE WHEN has_profile THEN prof.id END, prof.profile_type, prof.access_level,
        itap.access_person_identities(p_org, ident, CASE WHEN has_profile THEN prof.id END),
        ar.facility_id, ar.path, NULL, coalesce(tz, 'UTC'), p_at, NULL, NULL
      ) c
      WHERE c.subject_kind IS NOT NULL AND c.target_kind IS NOT NULL AND c.valid AND c.schedule_state <> 'out'
      ORDER BY c.priority DESC, (c.effect = 'deny') DESC, c.id
      LIMIT 1
    LOOP
      RETURN cand.effect = 'allow';
    END LOOP;
  END IF;

  IF has_profile AND EXISTS (
    SELECT 1 FROM itap.access_grants g
    WHERE g.organization_id = p_org AND g.profile_id = prof.id
      AND (g.revoked_at IS NULL OR g.revoked_at > p_at)
      AND g.valid_from <= p_at AND p_at < g.valid_until
      AND (g.area_id = ANY (ar.path)
           OR EXISTS (SELECT 1 FROM itap.access_points x
                      WHERE x.organization_id = p_org AND x.id = g.access_point_id AND x.area_id = ANY (ar.path)))
  ) THEN
    RETURN true;
  END IF;
  RETURN CASE WHEN governed THEN false END;
END;
$$;
REVOKE ALL ON FUNCTION itap.area_access_allowed(uuid, uuid, uuid, uuid, timestamptz) FROM PUBLIC;
