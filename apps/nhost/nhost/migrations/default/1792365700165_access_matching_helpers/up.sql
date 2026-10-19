-- Shared access-policy matching (plan-08 task 3): the subject / target / candidate matching of itap.evaluate_access
-- moved into helpers so itap.area_access_allowed (policy-based restricted_area_entry) uses the same logic.
-- The helpers are plain SQL without SET search_path and with fully qualified names, so the planner inlines them into
-- the caller's query (same plan as the former inline LATERAL subqueries). Results of evaluate_access are unchanged.

-- Effective identities of a person: the presented (effective) identity plus the effective identity of every identity
-- linked to the profile, so identity-segment subjects match profile-only requests too.
CREATE FUNCTION itap.access_person_identities(p_org uuid, p_identity uuid, p_profile uuid)
RETURNS uuid[]
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(array_agg(DISTINCT x.id), '{}')
  FROM (
    SELECT p_identity AS id WHERE p_identity IS NOT NULL
    UNION
    SELECT itap.effective_identity(p_org, i.id) FROM itap.identities i
    WHERE p_profile IS NOT NULL AND i.organization_id = p_org AND i.profile_id = p_profile
  ) x;
$$;

-- The first subject of a version matching the person (profile, segment membership open at p_at, profile type,
-- access level rank >=), as its kind; no row when none matches. p_profile NULL = no profile.
CREATE FUNCTION itap.access_subject_match(
  p_org uuid, p_version uuid, p_profile uuid, p_profile_type text, p_access_level text, p_identities uuid[],
  p_at timestamptz
) RETURNS TABLE (kind text)
LANGUAGE sql STABLE
AS $$
  SELECT CASE WHEN s.profile_id IS NOT NULL THEN 'profile' WHEN s.segment_id IS NOT NULL THEN 'segment'
              WHEN s.profile_type IS NOT NULL THEN 'profile_type' ELSE 'access_level' END
  FROM itap.access_policy_version_subjects s
  WHERE s.organization_id = p_org AND s.version_id = p_version
    AND ((p_profile IS NOT NULL AND s.profile_id = p_profile)
         OR (s.segment_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM itap.segments sg
               JOIN itap.segment_members m ON m.organization_id = sg.organization_id AND m.segment_id = sg.id
               WHERE sg.organization_id = p_org AND sg.id = s.segment_id
                 AND CASE sg.target WHEN 'identities' THEN m.identity_id = ANY (p_identities)
                                    ELSE p_profile IS NOT NULL AND m.profile_id = p_profile END
                 AND m.added_at <= p_at AND (m.removed_at IS NULL OR m.removed_at > p_at)))
         OR (p_profile IS NOT NULL AND s.profile_type = p_profile_type)
         OR (p_profile IS NOT NULL AND itap.access_rank(p_access_level) >= itap.access_rank(s.access_level)))
  ORDER BY CASE WHEN s.profile_id IS NOT NULL THEN 1 WHEN s.segment_id IS NOT NULL THEN 2
                WHEN s.profile_type IS NOT NULL THEN 3 ELSE 4 END, s.id
  LIMIT 1;
$$;

-- The first target of a version covering the place, as its kind; no row when none covers it.
-- Door mode (p_access_point given, p_path = the access point's area path): access point, area subtree, facility.
-- Area mode (p_access_point NULL, p_path = the area's path): an access point target covers the subtree of the area the
-- access point leads into (its area_id), an area target its subtree, a facility target the whole facility.
CREATE FUNCTION itap.access_target_match(
  p_org uuid, p_version uuid, p_facility uuid, p_path uuid[], p_access_point uuid
) RETURNS TABLE (kind text)
LANGUAGE sql STABLE
AS $$
  SELECT CASE WHEN t.access_point_id IS NOT NULL THEN 'access_point' WHEN t.area_id IS NOT NULL THEN 'area'
              ELSE 'facility' END
  FROM itap.access_policy_version_targets t
  WHERE t.organization_id = p_org AND t.version_id = p_version
    AND ((p_access_point IS NOT NULL AND t.access_point_id = p_access_point)
         OR (p_access_point IS NULL AND t.access_point_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM itap.access_points x
               WHERE x.organization_id = p_org AND x.id = t.access_point_id AND x.area_id = ANY (p_path)))
         OR t.area_id = ANY (p_path)
         OR t.facility_id = p_facility)
  ORDER BY CASE WHEN t.access_point_id IS NOT NULL THEN 1 WHEN t.area_id IS NOT NULL THEN 2 ELSE 3 END, t.id
  LIMIT 1;
$$;

-- Candidate versions for a person at a place and instant: the enforced versions (minus p_sim_policy) plus the
-- simulated p_override_version, each with its subject / target match, validity and schedule state (in p_tz).
-- Callers order by priority desc, (effect = 'deny') desc, id; the first full match decides.
CREATE FUNCTION itap.access_candidates(
  p_org uuid, p_profile uuid, p_profile_type text, p_access_level text, p_identities uuid[],
  p_facility uuid, p_path uuid[], p_access_point uuid, p_tz text, p_at timestamptz,
  p_override_version uuid, p_sim_policy uuid
) RETURNS TABLE (
  id uuid, policy_id uuid, effect text, priority integer, max_risk numeric, simulated boolean,
  subject_kind text, target_kind text, valid boolean, schedule_state text
)
LANGUAGE sql STABLE
AS $$
  WITH vers AS (
    SELECT v.*, false AS simulated
    FROM itap.access_policies p
    JOIN itap.access_policy_versions v ON v.organization_id = p.organization_id AND v.id = p.current_version_id
    WHERE p.organization_id = p_org AND NOT p.is_archived AND p.current_version_id IS NOT NULL
      AND p.id IS DISTINCT FROM p_sim_policy
    UNION ALL
    SELECT v.*, true FROM itap.access_policy_versions v WHERE v.organization_id = p_org AND v.id = p_override_version
  )
  SELECT v.id, v.policy_id, v.effect, v.priority, v.max_risk, v.simulated, sm.kind, tm.kind,
         ((v.valid_from IS NULL OR v.valid_from <= p_at) AND (v.valid_until IS NULL OR p_at < v.valid_until)),
         CASE WHEN v.schedule IS NULL OR jsonb_array_length(v.schedule) = 0 THEN 'always'
              WHEN itap.in_windows(v.schedule, p_tz, p_at) THEN 'in' ELSE 'out' END
  FROM vers v
  LEFT JOIN LATERAL itap.access_subject_match(p_org, v.id, p_profile, p_profile_type, p_access_level, p_identities,
                                              p_at) sm ON true
  LEFT JOIN LATERAL itap.access_target_match(p_org, v.id, p_facility, p_path, p_access_point) tm ON true;
$$;

REVOKE ALL ON FUNCTION itap.access_person_identities(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION itap.access_subject_match(uuid, uuid, uuid, text, text, uuid[], timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION itap.access_target_match(uuid, uuid, uuid, uuid[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION itap.access_candidates(uuid, uuid, text, text, uuid[], uuid, uuid[], uuid, text, timestamptz, uuid, uuid)
  FROM PUBLIC;

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
CREATE FUNCTION itap.area_access_allowed(p_org uuid, p_area uuid, p_identity uuid, p_profile uuid, p_at timestamptz)
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
