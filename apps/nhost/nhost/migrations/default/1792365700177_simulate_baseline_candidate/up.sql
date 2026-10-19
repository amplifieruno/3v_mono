-- simulate_access_policy, slice 8 task 4 fix round 1: each historical decision in the period is evaluated twice NOW
-- by the same engine at its decided_at — baseline (enforced policies, p_override_version NULL) and candidate (the
-- version substituted / added) — and the counts are baseline -> candidate transitions, so changes published after the
-- decision (or other drift: deleted rules, consumed grants, person changes) are not attributed to the simulated version.
-- `drifted` counts decisions whose baseline result differs from the recorded one; samples carry recorded_result /
-- recorded_reason and a `drift` flag (old_* = baseline, new_* = candidate). Cap: 2500 evaluated decisions (two
-- evaluations each), evenly spaced sample beyond.
ALTER TABLE itap_results.access_policy_simulations ADD COLUMN drifted integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION itap.simulate_access_policy(
  hasura_session json, p_version uuid, p_from timestamptz, p_to timestamptz, p_limit integer DEFAULT 20
) RETURNS SETOF itap_results.access_policy_simulations
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org constant uuid := itap.session_organization(hasura_session);
  max_decisions constant integer := 2500;
  lim integer := coalesce(p_limit, 20);
  pol uuid;
  total integer;
  step integer;
  d record;
  r itap.access_evaluation;
  b itap.access_evaluation;
  n_drift integer := 0;
  n_eval integer := 0;
  n_same integer := 0;
  n_g2d integer := 0;
  n_d2g integer := 0;
  n_reason integer := 0;
  n_skip integer := 0;
  samples jsonb := '[]';
BEGIN
  SELECT v.policy_id INTO pol FROM itap.access_policy_versions v WHERE v.organization_id = org AND v.id = p_version;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('access_policy_version_not_found');
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to OR p_to - p_from > interval '31 days' THEN
    PERFORM itap.raise_code('simulation_period_invalid');
  END IF;
  IF lim < 1 OR lim > 100 THEN
    PERFORM itap.raise_code('limit_out_of_range');
  END IF;

  SELECT count(*) INTO total FROM itap.access_decisions x
  WHERE x.organization_id = org AND x.decided_at >= p_from AND x.decided_at < p_to AND x.access_point_id IS NOT NULL;
  step := greatest(1, ceil(total::numeric / max_decisions)::integer);

  FOR d IN
    SELECT y.* FROM (
      SELECT x.id, x.access_point_id, x.identity_id, x.profile_id, x.device_id, x.decided_at, x.result, x.reason,
             x.policy_version_id, x.grant_id, row_number() OVER (ORDER BY x.decided_at, x.id) AS rn
      FROM itap.access_decisions x
      WHERE x.organization_id = org AND x.decided_at >= p_from AND x.decided_at < p_to AND x.access_point_id IS NOT NULL
    ) y
    WHERE (y.rn - 1) % step = 0
    ORDER BY y.decided_at, y.id
    LIMIT max_decisions
  LOOP
    BEGIN
      -- Baseline = the enforced policies now; candidate = the same with the version substituted / added.
      b := itap.evaluate_access(org, d.access_point_id, d.identity_id,
                                CASE WHEN d.identity_id IS NULL THEN d.profile_id END, d.device_id, d.decided_at,
                                false, NULL);
      r := itap.evaluate_access(org, d.access_point_id, d.identity_id,
                                CASE WHEN d.identity_id IS NULL THEN d.profile_id END, d.device_id, d.decided_at,
                                false, p_version);
    EXCEPTION WHEN check_violation THEN
      n_skip := n_skip + 1;
      CONTINUE;
    END;
    n_eval := n_eval + 1;
    IF b.result <> d.result THEN
      n_drift := n_drift + 1;
    END IF;
    IF r.result = b.result THEN
      n_same := n_same + 1;
      IF r.reason IS DISTINCT FROM b.reason THEN
        n_reason := n_reason + 1;
      END IF;
    ELSIF b.result = 'granted' THEN
      n_g2d := n_g2d + 1;
    ELSE
      n_d2g := n_d2g + 1;
    END IF;
    IF (r.result <> b.result OR r.reason IS DISTINCT FROM b.reason) AND jsonb_array_length(samples) < lim THEN
      samples := samples || jsonb_build_object(
        'decision_id', d.id, 'decided_at', d.decided_at, 'access_point_id', d.access_point_id,
        'identity_id', d.identity_id, 'profile_id', d.profile_id,
        'old_result', b.result, 'old_reason', b.reason, 'old_policy_version_id', b.policy_version_id,
        'old_grant_id', b.grant_id,
        'new_result', r.result, 'new_reason', r.reason, 'new_policy_version_id', r.policy_version_id,
        'new_grant_id', r.grant_id,
        'recorded_result', d.result, 'recorded_reason', d.reason, 'drift', b.result <> d.result);
    END IF;
  END LOOP;

  RETURN QUERY SELECT org, p_version, pol, p_from, p_to, total, n_eval, step > 1, n_same, n_g2d, n_d2g, n_reason,
    n_skip, samples, n_drift;
END;
$$;
