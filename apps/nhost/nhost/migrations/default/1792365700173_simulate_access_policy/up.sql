-- Policy simulation (plan-08 task 4; spec §8.1; SA_5 §2.1.4 "preview policy changes against historical access
-- patterns"). simulate_access_policy(session, version, from, to, limit) — STABLE query for org_admin, writes nothing:
-- every access decision of the organization with decided_at in [from, to) (at most 31 days) at a still existing access
-- point is evaluated again by the one engine, itap.evaluate_access(p_record => false, p_override_version => version),
-- at its decided_at with its person (identity, else profile) and device. The version (any status, e.g. a draft)
-- replaces its policy's enforced version, or is added when the policy has none. At most 5000 decisions are
-- evaluated: beyond that an evenly spaced sample in decided_at order (sampled = true).
-- Result (one row): decisions_in_period, evaluated, unchanged (same result), granted_to_denied, denied_to_granted,
-- reason_changed (same result, other reason), skipped (the engine refused the inputs, e.g. a deleted person), and
-- samples: up to p_limit (1..100, default 20) changed decisions in decided_at order with old / new result, reason,
-- policy version and grant.
-- Documented limits: contextual signals are evaluated as of now where no history exists — the over-capacity signal
-- reads the current area occupancy, so risk_exceeded outcomes may differ from the recorded ones; recent denials,
-- segment membership, grants (a single-use grant used at or after the decision still counts), overrides and
-- schedules are evaluated at decided_at. Person attributes (profile status, type, clearance) are current.
CREATE TABLE itap_results.access_policy_simulations (
  organization_id uuid NOT NULL,
  version_id uuid NOT NULL,
  policy_id uuid NOT NULL,
  period_from timestamptz NOT NULL,
  period_to timestamptz NOT NULL,
  decisions_in_period integer NOT NULL,
  evaluated integer NOT NULL,
  sampled boolean NOT NULL,
  unchanged integer NOT NULL,
  granted_to_denied integer NOT NULL,
  denied_to_granted integer NOT NULL,
  reason_changed integer NOT NULL,
  skipped integer NOT NULL,
  samples jsonb NOT NULL
);

CREATE FUNCTION itap.simulate_access_policy(
  hasura_session json, p_version uuid, p_from timestamptz, p_to timestamptz, p_limit integer DEFAULT 20
) RETURNS SETOF itap_results.access_policy_simulations
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org constant uuid := itap.session_organization(hasura_session);
  max_decisions constant integer := 5000;
  lim integer := coalesce(p_limit, 20);
  pol uuid;
  total integer;
  step integer;
  d record;
  r itap.access_evaluation;
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
      r := itap.evaluate_access(org, d.access_point_id, d.identity_id,
                                CASE WHEN d.identity_id IS NULL THEN d.profile_id END, d.device_id, d.decided_at,
                                false, p_version);
    EXCEPTION WHEN check_violation THEN
      n_skip := n_skip + 1;
      CONTINUE;
    END;
    n_eval := n_eval + 1;
    IF r.result = d.result THEN
      n_same := n_same + 1;
      IF r.reason IS DISTINCT FROM d.reason THEN
        n_reason := n_reason + 1;
      END IF;
    ELSIF d.result = 'granted' THEN
      n_g2d := n_g2d + 1;
    ELSE
      n_d2g := n_d2g + 1;
    END IF;
    IF (r.result <> d.result OR r.reason IS DISTINCT FROM d.reason) AND jsonb_array_length(samples) < lim THEN
      samples := samples || jsonb_build_object(
        'decision_id', d.id, 'decided_at', d.decided_at, 'access_point_id', d.access_point_id,
        'identity_id', d.identity_id, 'profile_id', d.profile_id,
        'old_result', d.result, 'old_reason', d.reason, 'old_policy_version_id', d.policy_version_id,
        'old_grant_id', d.grant_id,
        'new_result', r.result, 'new_reason', r.reason, 'new_policy_version_id', r.policy_version_id,
        'new_grant_id', r.grant_id);
    END IF;
  END LOOP;

  RETURN QUERY SELECT org, p_version, pol, p_from, p_to, total, n_eval, step > 1, n_same, n_g2d, n_d2g, n_reason,
    n_skip, samples;
END;
$$;
