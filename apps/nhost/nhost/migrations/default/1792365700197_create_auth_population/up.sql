-- Face authentication decision engine, part 1 (slice 9 task 2): the population an application authenticates against
-- and the population-adaptive threshold. Server-side only: every input comes from the application's stored bindings;
-- no request field can widen or narrow the population (the access point only narrows, and must be bound to the app).
--
-- Population of application A at instant T (itap.auth_population_eval):
--   1. Segments bound to A, membership open at T (added_at <= T < removed_at): identity-target rows -> the effective
--      identity (merge chain); profile-target rows -> the effective identities linked to that profile.
--   2. Facilities bound to A (ruling, plan-09 ledger): profiles with an enforced ALLOW access-policy version (current
--      version of a non-archived policy, valid at T) whose subject matches the profile (access_subject_match, at T)
--      and one of whose targets lies in the facility (facility, an area of it, an access point of it); profiles with a
--      grant valid at T, not revoked / consumed at T, for an area or access point of the facility; identities with a
--      tracking session in the facility overlapping [T - 30 days, T]. Profiles -> their effective identities.
--   3. Union of 1 and 2, kept when matchable: status not merged / archived, matching_enabled, a centroid exists (at
--      least one template), linked profile (if any) active, and is_synthetic = A.is_sandbox (a sandbox app sees only
--      synthetic identities, a production app never does). Evaluated first: steps 1 and 2 test each matchable
--      identity's merge group (cost grows with the gallery, not with segment or tracking history).
--   4. A.use_work_schedules: only identities whose linked profile is rostered at T (itap.profile_rostered_at, +/-30 min).
--   5. Access point P given: P must be bound to A (else access_point_not_bound); only identities the access engine
--      grants at P at T (itap.evaluate_access(..., p_record => false): nothing is written). Cost: one engine evaluation
--      per identity left after step 4 (~1 ms each), applied last; fine for the demo's populations (hundreds), a
--      set-based variant would be needed for tens of thousands.
-- The scope snapshot (recorded on every attempt) lists the inputs and the size after each stage.

-- Population floor for identification thresholds (cosine similarity): n <= 100 -> 0.50, <= 1 000 -> 0.55,
-- <= 10 000 -> 0.60, larger -> 0.65. A larger gallery raises the chance of a false match, so the floor rises.
CREATE FUNCTION itap.auth_threshold_floor(n integer) RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE WHEN coalesce(n, 0) <= 100 THEN 0.50 WHEN n <= 1000 THEN 0.55 WHEN n <= 10000 THEN 0.60 ELSE 0.65 END::numeric;
$$;

-- Threshold in force = clamp(max(app threshold, floor, request), threshold_min, threshold_max); the request can only
-- raise it (a lower value is ignored); when the floor exceeds threshold_max the floor wins (never below the floor).
-- A request outside 0..1 raises auth_threshold_invalid.
CREATE FUNCTION itap.auth_effective_threshold(
  p_threshold numeric, p_min numeric, p_max numeric, p_floor numeric, p_request numeric
) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF p_request IS NOT NULL AND (p_request < 0 OR p_request > 1) THEN
    PERFORM itap.raise_code('auth_threshold_invalid');
  END IF;
  RETURN greatest(least(greatest(p_threshold, p_floor, coalesce(p_request, 0)), p_max), p_min, p_floor);
END;
$$;

CREATE FUNCTION itap.auth_population_eval(
  p_org uuid, p_app uuid, p_access_point uuid, p_at timestamptz, OUT identity_ids uuid[], OUT scope jsonb
)
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap, public
-- Custom plans (see auth_decide): the generic plan of the array-parameter queries is ~20x slower here. The engine dry
-- runs of step 5 keep their own force_generic_plan (set by evaluate_access).
SET plan_cache_mode = force_custom_plan
AS $$
DECLARE
  v_at timestamptz := coalesce(p_at, now());
  app itap.client_applications;
  segs uuid[];
  facs uuid[];
  n_matchable integer;
  g_eff uuid[];
  g_member uuid[];
  g_profile uuid[];
  via_segments uuid[] := '{}';
  via_facilities uuid[] := '{}';
  united uuid[];
  rostered uuid[];
  allowed uuid[];
BEGIN
  SELECT * INTO app FROM itap.client_applications a WHERE a.organization_id = p_org AND a.id = p_app;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('client_application_not_found');
  END IF;
  IF p_access_point IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM itap.client_application_access_points b
    WHERE b.organization_id = p_org AND b.application_id = p_app AND b.access_point_id = p_access_point
  ) THEN
    PERFORM itap.raise_code('access_point_not_bound');
  END IF;
  SELECT coalesce(array_agg(b.segment_id ORDER BY b.segment_id), '{}') INTO segs
  FROM itap.client_application_segments b WHERE b.organization_id = p_org AND b.application_id = p_app;
  SELECT coalesce(array_agg(b.facility_id ORDER BY b.facility_id), '{}') INTO facs
  FROM itap.client_application_facilities b WHERE b.organization_id = p_org AND b.application_id = p_app;

  -- Matchable identities (step 3 applied first: the work scales with the gallery, not with history) with their merge
  -- groups (the identity plus every merged identity whose effective identity it is), then steps 1 and 2 per group.
  WITH matchable AS MATERIALIZED (
    SELECT i.id, i.profile_id
    FROM itap.identity_centroids c
    JOIN itap.identities i ON i.organization_id = c.organization_id AND i.id = c.identity_id
    LEFT JOIN itap.profiles p ON p.organization_id = i.organization_id AND p.id = i.profile_id
    WHERE c.organization_id = p_org
      AND i.status NOT IN ('merged', 'archived') AND i.matching_enabled
      AND i.is_synthetic = app.is_sandbox
      AND (i.profile_id IS NULL OR p.status = 'active')
  )
  SELECT coalesce(array_agg(y.eff), '{}'), coalesce(array_agg(y.member), '{}'), coalesce(array_agg(y.profile_id), '{}')
  INTO g_eff, g_member, g_profile
  FROM (
    SELECT m.id AS eff, m.id AS member, m.profile_id FROM matchable m
    UNION ALL
    SELECT x.eff, x.id, x.profile_id
    FROM (
      SELECT i.id, i.profile_id, itap.effective_identity(p_org, i.id) AS eff
      FROM itap.identities i WHERE i.organization_id = p_org AND i.status = 'merged'
    ) x
    WHERE x.eff IN (SELECT m.id FROM matchable m)
  ) y;
  SELECT count(DISTINCT e) INTO n_matchable FROM unnest(g_eff) AS e;

  -- 1. Segments (membership open at v_at; identity rows of any group member, profile rows of their profiles).
  IF cardinality(segs) > 0 THEN
    SELECT coalesce(array_agg(DISTINCT g.eff), '{}') INTO via_segments
    FROM unnest(g_eff, g_member, g_profile) AS g (eff, member, profile_id)
    WHERE EXISTS (
        SELECT 1 FROM itap.segment_members m
        WHERE m.organization_id = p_org AND m.segment_id = ANY (segs) AND m.identity_id = g.member
          AND m.added_at <= v_at AND (m.removed_at IS NULL OR m.removed_at > v_at))
      OR (g.profile_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM itap.segment_members m
        WHERE m.organization_id = p_org AND m.segment_id = ANY (segs) AND m.profile_id = g.profile_id
          AND m.added_at <= v_at AND (m.removed_at IS NULL OR m.removed_at > v_at)));
  END IF;

  -- 2. Facilities (allow policies, grants, tracking sessions overlapping the last 30 days).
  IF cardinality(facs) > 0 THEN
    WITH areas AS MATERIALIZED (
      SELECT a.id FROM itap.areas a WHERE a.organization_id = p_org AND a.facility_id = ANY (facs)
    ),
    points AS MATERIALIZED (
      SELECT x.id FROM itap.access_points x WHERE x.organization_id = p_org AND x.facility_id = ANY (facs)
    ),
    versions AS MATERIALIZED (
      SELECT v.id FROM itap.access_policies p
      JOIN itap.access_policy_versions v ON v.organization_id = p.organization_id AND v.id = p.current_version_id
      WHERE p.organization_id = p_org AND NOT p.is_archived AND p.current_version_id IS NOT NULL AND v.effect = 'allow'
        AND (v.valid_from IS NULL OR v.valid_from <= v_at) AND (v.valid_until IS NULL OR v_at < v.valid_until)
        AND EXISTS (
          SELECT 1 FROM itap.access_policy_version_targets t
          WHERE t.organization_id = p_org AND t.version_id = v.id
            AND (t.facility_id = ANY (facs) OR t.area_id IN (SELECT id FROM areas) OR t.access_point_id IN (SELECT id FROM points))
        )
    ),
    profs AS MATERIALIZED (
      SELECT DISTINCT g.profile_id FROM unnest(g_eff, g_member, g_profile) AS g (eff, member, profile_id) WHERE g.profile_id IS NOT NULL
    ),
    covered AS MATERIALIZED (
      SELECT pr.profile_id FROM profs pr JOIN itap.profiles p ON p.organization_id = p_org AND p.id = pr.profile_id
      WHERE EXISTS (
        SELECT 1 FROM versions v
        WHERE EXISTS (SELECT 1 FROM itap.access_subject_match(
          p_org, v.id, p.id, p.profile_type, p.access_level, itap.access_person_identities(p_org, NULL, p.id), v_at))
      )
      OR EXISTS (
        SELECT 1 FROM itap.access_grants gr
        WHERE gr.organization_id = p_org AND gr.profile_id = p.id
          AND (gr.revoked_at IS NULL OR gr.revoked_at > v_at) AND (gr.used_at IS NULL OR gr.used_at > v_at)
          AND gr.valid_from <= v_at AND v_at < gr.valid_until
          AND (gr.area_id IN (SELECT id FROM areas) OR gr.access_point_id IN (SELECT id FROM points))
      )
    )
    SELECT coalesce(array_agg(DISTINCT g.eff), '{}') INTO via_facilities
    FROM unnest(g_eff, g_member, g_profile) AS g (eff, member, profile_id)
    WHERE g.profile_id IN (SELECT c.profile_id FROM covered c)
      OR EXISTS (
        SELECT 1 FROM itap.tracking_sessions s
        WHERE s.organization_id = p_org AND s.identity_id = g.member AND s.facility_id = ANY (facs)
          AND s.started_at <= v_at AND coalesce(s.ended_at, s.last_detected_at) >= v_at - interval '30 days');
  END IF;

  SELECT coalesce(array_agg(DISTINCT x.id ORDER BY x.id), '{}') INTO united
  FROM unnest(via_segments || via_facilities) AS x (id);

  -- 4. Work schedules.
  rostered := united;
  IF app.use_work_schedules THEN
    SELECT coalesce(array_agg(i.id ORDER BY i.id), '{}') INTO rostered
    FROM itap.identities i JOIN itap.profiles p ON p.organization_id = i.organization_id AND p.id = i.profile_id
    WHERE i.organization_id = p_org AND i.id = ANY (united) AND itap.profile_rostered_at(p, v_at);
  END IF;

  -- 5. Access point narrowing (engine dry run, nothing recorded).
  allowed := rostered;
  IF p_access_point IS NOT NULL THEN
    SELECT coalesce(array_agg(x.id ORDER BY x.id), '{}') INTO allowed
    FROM unnest(rostered) AS x (id)
    WHERE (itap.evaluate_access(p_org, p_access_point, x.id, NULL, NULL, v_at, false)).result = 'granted';
  END IF;

  identity_ids := allowed;
  scope := jsonb_build_object(
    'application_id', app.id,
    'sandbox', app.is_sandbox,
    'segments', to_jsonb(segs),
    'facilities', to_jsonb(facs),
    'facility_rule', 'allow policy or grant in the facility, or a tracking session there within 30 days',
    'access_point_id', p_access_point,
    'use_work_schedules', app.use_work_schedules,
    'at', v_at,
    'sizes', jsonb_build_object(
      'matchable', n_matchable,
      'segments', cardinality(via_segments),
      'facilities', cardinality(via_facilities),
      'union', cardinality(united),
      'after_schedule', cardinality(rostered),
      'after_access_point', cardinality(allowed),
      'final', cardinality(allowed)
    )
  );
END;
$$;

-- The population as rows / its scope snapshot (admin-only helpers for the backend, the seed and tests).
CREATE FUNCTION itap.auth_population(p_org uuid, p_app uuid, p_access_point uuid, p_at timestamptz)
RETURNS TABLE (identity_id uuid)
LANGUAGE sql VOLATILE
SET search_path = pg_catalog, itap
AS $$
  SELECT x.id FROM itap.auth_population_eval(p_org, p_app, p_access_point, p_at) e, unnest(e.identity_ids) AS x (id);
$$;

CREATE FUNCTION itap.auth_population_scope(p_org uuid, p_app uuid, p_access_point uuid, p_at timestamptz)
RETURNS jsonb
LANGUAGE sql VOLATILE
SET search_path = pg_catalog, itap
AS $$
  SELECT e.scope FROM itap.auth_population_eval(p_org, p_app, p_access_point, p_at) e;
$$;

REVOKE ALL ON FUNCTION itap.auth_threshold_floor(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION itap.auth_effective_threshold(numeric, numeric, numeric, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION itap.auth_population_eval(uuid, uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION itap.auth_population(uuid, uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION itap.auth_population_scope(uuid, uuid, uuid, timestamptz) FROM PUBLIC;
