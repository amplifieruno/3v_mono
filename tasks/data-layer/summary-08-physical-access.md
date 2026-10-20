# Slice 8 summary: Physical access (policies, grants, decisions, overrides, terminal distribution)

Branch `feat/data-layer-foundation`: commits `f3d483a..HEAD` (`1ad319f` .. `07bac11`, the Task 6 docs/gates commit and the final-review fix wave). Spec: `design.md` (§6.13, §8.1-8.5, as built); plan: `plan-08-physical-access.md`. Migrations 150-186. No new backend dependencies.

## What was built

### Task 1: schema (migrations 150-158)
- Enums `access_effects`, `override_modes`, `access_decision_results`, `access_decision_reasons`.
- **Versioned policies** (`access_policies` POL-xxxxx, `access_policy_versions`, subjects, targets) with approval on the version: draft -> `pending_approval` -> `published`/`superseded`, four-eyes (`four_eyes_required`), `rejection_reason`, `max_risk`, priority, schedule, validity. Status and approval columns change only under `itap.access_approval_context`; pending versions and their children are frozen. Header pointer and archive flags are trigger-guarded (also against admin-secret GraphQL and SQL).
- `access_grants` (immutable except once-only `used_at` and revocation through `revoke_access_grant`), `emergency_overrides` (+ areas; written only under `itap.override_context`), `access_decisions` (ro, append-only, not audited).
- **Policy epoch**: `organization_settings.policy_epoch`, `policy_urgent_epoch`, `policy_revocation_bound_seconds` (60 s); `bump_policy_epoch(org, urgent)`; triggers on policy publish/archive, grants, overrides; deferred credential-withdrawal triggers (profile status, level, type, delete, segment membership close, blacklist entry), narrowed to subjects of enforced versions where a dependency exists.

### Task 2: decision engine (migrations 159-163)
- `itap.evaluate_access` (admin-only, the only evaluator) and `check_access` (org_admin; records at `now()` only). Order: overrides (evacuation at an exit first) -> access point availability -> person checks -> versions (priority desc, deny first) -> grants -> default reason. Wall-clock schedules in the facility timezone (DST rule), risk score with documented weights, full trace in `signals`, decision + `access_granted`/`access_denied` event + Stage C. Single-use grants consumed by a single guarded UPDATE (concurrency tested with 8 callers and with two-session lock tests).

### Task 3: pipeline integration (migrations 164-170)
- `access_points.face_credential`: the bound camera is a credential reader; decisions idempotent per detection (`detection_id` partial unique) and per person within a symmetric cooldown. Shared matching helpers and `area_access_allowed` (per-area governance) drive `restricted_area_entry` by policy (`basis: policy|rank`). Real `tailgating` rule in Stage B under a door lock.

### Task 4: overrides, distribution, simulation, analytics (migrations 171-179)
- `start_emergency_override` / `end_emergency_override`, cron `end_emergency_overrides` (two-phase). Terminal distribution: `terminal_policy_payload` (with a `profiles` section), `terminals_due_for_sync`, `record_terminal_sync`, `terminal_sync_status`, tables `terminal_policy_syncs` and `policy_urgent_epochs`, backend stub transport, cron `sync_terminal_policies`, event trigger `policy_urgent_epoch_bumped`, action `publish_policy_to_terminals`. `simulate_access_policy` (baseline vs candidate, drift against the recorded result) and `policy_analytics`.

### Task 5: seed (migration 180)
- Nova Tower: 5 history policies and 3 live ones (executive floor published, parking gate pending, loading dock draft) through the real submit/approve lifecycle, Riverside "Staff: front door"; face-credential doors (Turnstile 1-4, Server Room Door); 14 visitor day grants (one single-use) and one revoked contractor grant; a fire drill via `itap.seed_emergency_override`; evacuation exits, a tailgating case, early and terminated contractor attempts; Turnstile Terminal 4 offline and never synced; notification rule "Emergency overrides". About 6.6k decisions through the real engine (policy_allow 6529, grant 9, override_evacuation 8; denied: outside_schedule 41, profile_inactive 3, unknown_person 2, no_rule 1, policy_deny 1, risk_exceeded 1), 1 tailgating event. Seed +45-60 s (about 215-233 s total).

## Rulings (from the ledger)
- Simulation reuses the engine through an optional `p_override_version` (cost: small).
- Rollback of a policy = new draft copied from the superseded version through submit/approve; no direct republish; four-eyes everywhere.
- Single-use grant consumption is checked centrally only; terminal payloads never contain single-use grants; terminals enforce `valid_until` and override `ends_at` from the payload (no epoch bump on expiry).
- Extra urgency cases accepted (allow replaced by allow, ending unlock/evacuation, then every override end/start); reasons `outside_schedule` / `profile_inactive` are used by the engine, `access_point_unavailable` added.
- Header `current_version_id` / archive guarded by triggers (admin path cannot bypass four-eyes); archive supersedes the version (published == enforced) and rejects a pending version.
- Credential withdrawal is urgent via deferred (commit-time, once per transaction and organization) triggers; segment churn and attribute changes bump only when an enforced policy subject depends on them (avoids urgent-sync storms).
- Life safety: an active evacuation grants an exit (direction out/both) even under lock_all; entry stays locked. Unlinked faces get `unknown_person`.
- Identity-target segment subjects match through every identity linked to the profile. A device must be bound to the access point (`invalid_device`; ignored with a trace note inside `evaluate_access`). `check_access` records at `now()` only.
- Out-of-service access points (inactive/maintenance) deny with `access_point_unavailable` after overrides.
- Per-area governance for `restricted_area_entry`: only enforced allow versions or the person's grants govern an area; a matching deny in an ungoverned area still yields restricted; others keep the rank rule (avoids floor-wide false alarms from one door policy).
- Decision per detection is idempotent; cooldown per (person, access point), symmetric window; tailgating needs granted >= 1 and people > granted, door lock for every door, and ± window dedup against existing tailgating events.
- Event trigger `policy_urgent_epoch_bumped` accepted (needed to meet the 60 s bound; cron is the safety net). Segment additions to segments referenced by enforced policies bump lazily so allow lists converge within 15 min. Sync log only on state change.
- Four review fixes for distribution: payload carries person data (`profiles`), `within_bound` measured from the earliest unapplied urgent epoch (`policy_urgent_epochs`; never-synced terminal from its binding), simulation diffs baseline vs candidate (both evaluated now, cap 2500, recorded result kept as drift), expiry cron two-phase (settings last).
- Seed: accepted +45-60 s and contractor `max_risk` 0.4 (the 0.6 in the brief is reachable only through live camera health).

## Deviations from spec
- §6.13: extra columns (`max_risk`, `rejection_reason`, rejected_*, grant revocation columns, `end_reason`, `detection_id`, `facility_id`, `override_id`, `epoch`, `face_credential`, settings counters/bounds), extra tables `policy_urgent_epochs` and `terminal_policy_syncs`, reasons `outside_schedule`, `profile_inactive`, `access_point_unavailable`.
- §8.1: `check_access` takes no time (records at `now()`); `simulate_access_policy` takes a version (not a policy) and compares baseline with candidate; `evaluate_access` is internal.
- §8.2: `restricted_area_entry` uses per-area governance, not per facility; tailgating rule as above.
- §8.4: event trigger `policy_urgent_epoch_bumped` is new. §8.5: `publish_policy_to_terminals` forces a real stub push and records sync state.
- Seed: policy approval timestamps (`submitted_at`, `approved_at`, `published_at`) are at seed time (guards forbid back-dating); `valid_from` and `created_at` are back-dated.

## Deferred minors and known limits
- Risk components (occupancy, device health) are read now also for a past `at` (seed replay, simulation): past risk scores are approximate. The 2500-sample simulation cap has no test (fixtures too slow).
- `check_access` records and so consumes a single-use grant (no dry run; use `simulate_access_policy`).
- The blacklist-entry bump is conservative: neither the engine nor the payload reads blacklists directly.
- Four-eyes covers the policy version, not the definition of a segment it references (segment conditions and manual members change without approval).
- Terminal payload `profiles` is computed per terminal (cache per epoch at scale); identity-target subjects carry identity ids (edge terminals would need identity resolution); real terminals must reject payloads older than their synced epoch (the stub does).
- A single-use grant authorizes area presence for its whole window even after consumption; it does not open the door again.
- Tailgating buckets can rarely split one case across buckets under out-of-order evaluation (dedup by ± window event check mitigates).
- Concerns carried from Task 1: hourly `sync_segment_members` closing rule rows and identity merges may cause frequent urgent epochs in high-churn organizations (narrowed to referenced segments).
- Seed: Parking/Loading dock policies not enforced by design; tailgating reaches the security team through the "Tailgating" rule (final review), restricted entries through "Restricted areas and after-hours presence"; no seeded incident from them.

## Final review fix wave (migrations 181-186)
All pending items of the task reviews and the eleven final-review findings are resolved (report:
`.superpowers/sdd/plan-08-physical-access/final-fix-report.md`):
1. `stats_presence` ignores locations after the session end (`181`); the seed's estimated locations lie inside their session (`occurred_at = last_detected_at`). The slice-7 `expectStatsReproducible` seed check passes at any time (it was a real day/hour-boundary difference: a location after `ended_at` extended presence in a range run but not hour by hour).
2. `segments-hourly`: test times kept inside one UTC day (`refresh_segment_daily_stats` writes the days of `at - 1 h` and `at`); code unchanged.
3. Identity links reach terminals (`183`): unlink / relink / delete of a linked identity bump urgently (merge rollback included), a new link lazily; reopened memberships bump lazily.
4. Policy lifecycle functions (create draft, submit, approve, reject, archive) require an active, unexpired member (`182`).
5. Lazy bumps on profile reactivation and raised access level (narrowed); area path change urgent (`183`). A type change was already urgent when it matters.
6. Door lock first for every detection with an access point (`184`); conventions updated.
7. `record_terminal_sync` rejects a synced result without checksum or above the current epoch (`185`).
8. `segment_members` delete withdraws only open rows (`183`).
9. Override expiry test asserts exactly two urgent bumps.
10. Seed: notification rule "Tailgating" -> Security team inbox; `seed_emergency_override` requires active members (`186`); `notificationPlan.ts` split (`notificationRules.ts`). Turnstile Gallery capacity 60 -> 120: floors have no camera, so morning arrivals stay in the gallery until their session closes; on some run days the replay crossed 60 and added a second `occupancy_exceeded` (date-dependent seed flake).
11. Docs (design §8.1, conventions): risk components read now for past times; `check_access` consumes single-use grants (no dry run, use simulation); blacklist bump is conservative; four-eyes covers the policy version, not a referenced segment's definition.

Still open (accepted): back-dated approval timestamps in the seed (guards forbid back-dating; documented under Deviations) and a benchmark run with the seed policies active (the benchmark comment states its synthetic policy set).

## Carry-overs to slice 10 (retention must purge)
- `access_decisions` (append-only log, ~6.6k seeded, grows per door passage) and their events.
- `terminal_policy_syncs` (an offline terminal with a pending epoch logs on state change only, but successes log every sync).
- `policy_urgent_epochs` (keep only epochs above the minimum synced epoch).
- Used and expired `access_grants` (a used grant cannot be deleted by users; retention must run as the system), revoked grants.
- Ended `emergency_overrides` with their areas.
- Final review additions: delete order (decisions/events before grants and overrides; override areas before overrides); the override guard flag (`itap.override_context`) must be set to delete override rows; a grant DELETE bumps urgently today, so retention needs a `WHEN` (skip expired / revoked / used grants) or a system flag to avoid storms; `access_grants` reference profiles, so open grants block profile deletion (retention / DSR must delete or revoke them first); volumes to plan: `access_granted` / `access_denied` events and their deliveries, audit rows of the policy lifecycle, `terminal_policy_syncs` successes.

## Owner actions (not done by the agents)
- Rotate ALL secrets (Hasura admin secret, JWT key, Postgres password, action secret).
- Audit production Postgres for the slice 3/4 attacker persistence (role `priv_esc`, event triggers `log_start`/`log_end`, database `readme_to_recover`). Dev DB was rebuilt clean on 2026-10-19.
- Production: `WEBHOOK_ALLOW_PRIVATE_TARGETS=false`, `WEBHOOK_SINK_ENABLED=false`, `BACKEND_URL` reachable from Hasura, `ACTION_SECRET` set. Real terminal transport (stub today) must reject older epochs and enforce `valid_until` / override `ends_at` itself. Nothing is merged to `main`; production untouched.

## Performance
Seeded Nova Tower, 10 access points, rolled-back benchmark (`access-engine-benchmark`, 240 calls; 1000-call manual run similar):

| measure | p50 | p95 |
|---|---|---|
| `evaluate_access` (`latency_ms`) | about 1.0 ms | 1.1-1.3 ms (per path <= 1.51 ms: grant 1.33, no_rule 1.23, policy_allow 1.30, policy_deny 1.51) |
| full `check_access` (decision + event + Stage C) | about 3.4 ms | about 3.3-4.2 ms |

The benchmark archives the seed policies inside its rolled-back block, so it measures a synthetic policy set (7 policies, 180 grants). The GraphQL round trip is not included. Revocation bound: a reachable terminal converges about 1 s after an urgent bump (event trigger); cron safety net 60 s.

## How to run
```bash
make dev-compose && make hasura_apply
pnpm --filter nhost metadata:generate
pnpm seed                              # --reset re-creates the demo data (about 215-230 s)
pnpm --filter nhost test
pnpm --filter backend exec vitest run src      # never watch mode
pnpm --filter backend test:integration
RUN_SEED_TEST=1 pnpm --filter backend exec vitest run -c vitest.integration.config.ts tests/integration/seed.test.ts
```
Live demo: as org_admin call `check_access` on a turnstile for a seeded profile; start an emergency override and watch `access_decisions`; revoke a grant and read `terminal_sync_status`; run `simulate_access_policy` on the pending parking-gate version; query `policy_analytics`.

## Gate results
- Final review fix wave (2026-10-20): `pnpm lint` (0 errors, pre-existing warnings in packages/shared), `pnpm typecheck`, `pnpm build`: clean. `pnpm --filter nhost test` 97/97. Backend unit (`vitest run src`) 59 files / 431 tests. Full integration run (once): 123 files passed, 1 skipped; 835 tests passed, 10 skipped, 0 failed. Seed test (`RUN_SEED_TEST=1`): 10/10 (incl. `expectStatsReproducible`). `pnpm seed --reset` 235 s, then `pnpm seed` idempotent (4 s). Migrations 181-186: down 6 and up again applied cleanly.
- Task 6 (before the fix wave): full integration 123 files / 827 tests passed; seed test 9/10 (the slice-7 stats check, fixed above).
