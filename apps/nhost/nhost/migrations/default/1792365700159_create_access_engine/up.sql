-- Access decision engine (slice 8 task 2; helpers here, itap.evaluate_access in *_create_evaluate_access, check_access
-- in *_create_check_access; spec §6.13, §8.1 check_access; SA_5 §2.1.4, §3.4 p95 < 100 ms).
-- itap.evaluate_access (internal, admin-only) is the one evaluator: check_access (tracked mutation), Stage B
-- (face-as-credential, task 3) and simulate_access_policy (task 4, p_record => false + p_override_version) reuse it.
--
-- Deterministic evaluation order (first step that decides wins):
--   0. person: identity -> effective identity (merge chain) -> its linked profile; a profile may be given directly.
--   1. active emergency override covering the access point (facility; area rows = those area subtrees, none = whole
--      facility), ordered lock_all, unlock_all, evacuation, then started_at desc, id: lock_all -> denied override_lock;
--      unlock_all -> granted override_unlock; evacuation -> granted override_evacuation when the access point's
--      direction is out/both, otherwise the next override / step.
--   -  no identity and no profile -> denied unknown_person; profile not active -> denied profile_inactive.
--   2. enforced versions (header current_version_id, not archived; p_override_version substitutes its policy's
--      current version, or is added when that policy has none) whose subjects match (profile | segment membership
--      open at p_at | profile_type | access_level rank >=) and targets cover the access point (its facility | an area
--      whose subtree holds its area | the access point), valid_from <= p_at < valid_until, schedule (windows) contains
--      p_at in the access point's facility timezone; sorted priority desc, deny before allow, version id; the first
--      match decides: deny -> policy_deny; allow -> policy_allow, or risk_exceeded when risk > max_risk.
--   3. grant (no version matched): not revoked at p_at, valid_from <= p_at < valid_until, for the access point or an
--      area whose subtree holds it, unused if single_use; reusable grants before single-use ones, then valid_until
--      desc, id. A single-use grant is consumed (used_at = p_at) atomically only when recording:
--      UPDATE ... WHERE used_at IS NULL RETURNING — a concurrent consumer blocks on the row lock, re-checks and finds
--      it used, so exactly one decision is granted by it.
--   4. default: outside_schedule when an allow version matched everything except its schedule; unknown_person when
--      no profile is known; otherwise no_rule.
-- DST: windows are wall-clock (itap.in_windows on p_at AT TIME ZONE facility tz): a window overlapping the skipped
-- spring-forward hour is shorter by that hour; during the repeated fall-back hour both instances match.
-- Risk (signals computed once; components clamped to 0..1 in total): over_capacity 0.3 (the access point's area or an
-- ancestor with a capacity has occupancy >= capacity, current area_occupancy), recent_denials 0.15 per denied decision
-- of this person (profile or effective identity) in [p_at - 10 min, p_at), at most 0.45, device_health (p_device, else
-- the access point's terminal) warning 0.15 / critical 0.3 / unknown 0.1, unknown_identity 0.4 (no profile).
-- Trace (signals jsonb, stored on the decision): at, timezone, person, overrides (each with applied), candidates
-- (every evaluated version in order: version/policy id, effect, priority, subject/target kind matched or null, valid,
-- schedule always/in/out, matched, decided, simulated), grants considered, contextual signals, risk components,
-- decided_by (override/person/policy/grant/default).
-- Recording (p_record): access_decisions row (epoch = organization policy_epoch read without locks, latency_ms =
-- clock_timestamp() since the call started, decided_at = p_at) + access_granted / access_denied via emit_event
-- (dedup key decision:<id>) + finish_events (Stage C). Without p_record nothing is written (simulation).

CREATE TYPE itap.access_evaluation AS (
  result text,
  reason text,
  policy_version_id uuid,
  grant_id uuid,
  risk_score numeric(4, 3),
  signals jsonb,
  decision_id uuid,
  override_id uuid
);

-- The identity an identity was (transitively) merged into; itself when not merged.
CREATE FUNCTION itap.effective_identity(p_org uuid, p_identity uuid) RETURNS uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH RECURSIVE chain (id, depth) AS (
    SELECT p_identity, 0
    UNION ALL
    SELECT m.target_identity_id, c.depth + 1
    FROM chain c
    JOIN itap.identity_merge_sources s ON s.organization_id = p_org AND s.source_identity_id = c.id
    JOIN itap.identity_merges m ON m.organization_id = s.organization_id AND m.id = s.merge_id AND m.status = 'completed'
    WHERE c.depth < 32
  )
  SELECT id FROM chain ORDER BY depth DESC, id LIMIT 1;
$$;

-- Segment membership of a subject at an instant, closed rows included (subject_in_segment).
CREATE INDEX segment_members_organization_id_segment_id_profile_id_idx
  ON itap.segment_members (organization_id, segment_id, profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX segment_members_organization_id_segment_id_identity_id_idx
  ON itap.segment_members (organization_id, segment_id, identity_id) WHERE identity_id IS NOT NULL;
-- Recent denials of a person (risk signal).
CREATE INDEX access_decisions_denied_profile_idx ON itap.access_decisions (organization_id, profile_id, decided_at)
  WHERE result = 'denied';
CREATE INDEX access_decisions_denied_identity_idx ON itap.access_decisions (organization_id, identity_id, decided_at)
  WHERE result = 'denied';
-- Valid grants of a profile (non-revoked).
CREATE INDEX access_grants_open_profile_idx ON itap.access_grants (organization_id, profile_id, valid_from)
  WHERE revoked_at IS NULL;
