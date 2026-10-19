# Slice 4 summary: Detections, tracking, events, incidents, recognition

Branch `feat/data-layer-foundation`: commits `8cc44ba..HEAD` (`ec4085c` .. `244d2f7` plus the Task 7 docs/gates commit). Spec: `design.md` (§6.2 visits, §6.8, §6.9, §7, §8.2); plan: `plan-04-detections-events.md`.

## What was built

**Tables (migrations `1792365700000`..`036`)**
- Tracking: `detections` (append-only, high volume, no audit trigger), `tracking_sessions`, `identity_locations`, `area_occupancy` (+ computed fields `areas.current_occupancy` etc.), enums `tracking_session_statuses`, `movement_types`.
- Watch lists: `watch_lists`, `watch_list_entries` (+ `watch_list_kinds`: blacklist / vip / watch). Entries follow identity merges (`merge_identities` re-points them, recorded in `identity_merge_moves` for rollback; profile merges fold profile-level entries).
- Event rules (versioned): `event_rules`, `event_rule_versions`, `event_rule_version_scopes`, enums `event_rule_types`, `version_statuses`; generic helpers `assign_version_number`, `guard_version_status`, `guard_version_children`, `create_draft_version`, `publish_version`; wrappers `create_event_rule_draft`, `publish_event_rule_version`.
- Events and incidents: `events` (+ `event_types`, `event_severities`), `incidents` (+ statuses, dispositions, `dedup_key`), `incident_events`, `incident_identities`, `incident_activities`, `incident_notes`, `incident_note_files`, `shift_handovers`, `shift_handover_incidents`, `operator_workspaces`.
- Visits: `visits` (+ `visit_statuses`), functions `check_in_visit` / `check_out_visit` / `cancel_visit` (org_admin); status fields change only through them and the lifecycle cron.

**Stage A** (`itap.track_detection`, AFTER INSERT on `detections`, same transaction): maintains sessions, `identity_locations`, `area_occupancy`, throttled identity counters; links a session to a visit when it opens. Serialised per identity by an advisory xact lock taken in the BEFORE INSERT trigger `detections_derive` (which also derives the access point, only from a single camera binding).

**Stage B** (`itap.evaluate_detection`, admin-only; event trigger `detection_created` -> backend, 10 retries x 15 s): session-opened events (`detection_known/unknown`, watch-list matches with list severity, `inactive_profile_detected`, `unexpected_facility`, `after_hours`), area-entered events (`restricted_area_entry` by `itap.access_rank` over the area path, `occupancy_exceeded` per 15-minute bucket). `itap.emit_event` + `itap.finish_events` (rules in scope, severity, incidents, counters).

**Crons** (generated from `metadata-src/crons.ts`): `close_stale_sessions` (2 min), `evaluate_dwell_rules` (1 min; loitering / unusual dwell measured to `last_seen_at`), `lifecycle_jobs` (daily 03:00 UTC: no-show visits, expired visitor/contractor profiles, expired invitations, archive unknown identities, tolerance 1 h), plus slice 3's `heartbeat`, `device_health_check`. `record_device_health` also writes device platform events.

**Recognition pipeline** (`apps/backend/src/recognition/`): manager polls cameras with `recognition_enabled` every 10 s (one session per device); session grabs a stream-server snapshot every 1000/fps ms with per-device backpressure; frame processor runs InsightFace (max 5 faces), `match_face` in the device org with its `recognition_threshold`, unknown faces become camera identities (shared `face/cameraIdentity.ts`, per-organization mutex around re-match -> create), detections inserted one per statement sorted by identity; `itap.consider_template` keeps the best 5 templates (new one must beat the worst by > 0.05). Socket.io `detection` push to room `device:<id>`; join requires the org token and is refused/disconnected at token expiry. Actions `recognition_start` / `recognition_stop` / `recognition_status` (org_admin; refuse non-active cameras). InsightFace / Hasura calls have timeouts (30 s / 15 s, env-configurable).

**Event rules, incidents:** rule versions filter by scope (facility / area incl. ancestors; segment scopes never match until slice 6) and, for `watchlist` rules, by `parameters.watch_list_kinds` (event type -> kind: blacklist_match -> blacklist, vip_arrival -> vip, watchlist_match -> watch; CHECK-validated). One incident per session and rule (`dedup_key`; `occupancy:<area>:rule:<rule>:<bucket>` for occupancy). `incidents.created_at` is the triggering event's `occurred_at`; the creation activity is dated the same. Closed incidents are terminal; resolved -> closed or investigating. Incident title is the rule name prefixed to the event title, except when the event title already starts with the rule name (Task 7 fix, migration `036`).

**Seed replay** (`src/seed/history*.ts`): Nova Tower 30 days of history through the real pipeline: tracked-people identities (every 12th employee left unlinked), threshold 0.40, operating hours Mon-Fri 07-21 / Sat 09-15, watch lists, 4 published rules + 1 draft ("Blacklist match" and "VIP arrival" by kind), visits (quarter-hour slots), one transaction per simulated day (Stage A, synchronous `evaluate_detection`, dwell rules and stale sessions per 5-minute window, daily lifecycle), incident lifecycle through the mutation functions (backdated), handovers, operator workspaces, estimated locations, a week of Riverside history with one incident. Cameras are seeded with `recognition_enabled=false`.

## Rulings (from the ledger)

- Deferred evaluations (restricted_area_entry by policy, abnormal_movement, tailgating) are no-op functions until their inputs exist; carry-overs below.
- Merges do not move detections/sessions/occupancy (history stays with the merged source); timelines/analytics resolve merged sources via `identity_merge_sources`; an active session of a source closes naturally by timeout. Cost: per-identity reports must union merged sources.
- Event rule code prefix `RULE`; closed incidents terminal; resolved -> closed or -> investigating.
- Segment-scoped rule versions don't match until slice 6; unknown identity = lowest clearance.
- T1 fixes folded: `tracking_sessions.opened_by_detection_id`, advisory xact lock per identity instead of row lock, partial index on `thumbnail_file_id`, dropped movement_type and active `last_detected_at` indexes; `close_stale_sessions` locks identities in id order; detections inserted one row per statement or sorted by identity.
- `merge_identities` re-points watch-list entries of sources to the target (per-list conflict keeps one, preferring non-expiring); `merge_profiles` also folds profile-level entries.
- Event writers emit events first, then `finish_events` (incidents, counters); occupancy incidents keyed per area bucket; counter bumps don't touch `updated_at`.
- Visits: nullable `facility_id`; a session links to a checked_in visit (`checked_in_at <= detected_at <= expected_end + 4 h`) or a scheduled visit within `[start - 2 h, end]` in the matching facility; visit details editable only while scheduled; `lifecycle_jobs` daily, also expires invitations and archives unknown identities.
- Socket join requires an org-token check; thumbnails stored only for new identities; manager gated by `RECOGNITION_ENABLED` (default true as a kill switch). The seed turns all cameras' `recognition_enabled` off (also fixes existing dev rows in place); a live demo is `recognition_start` on a camera.
- Replay marker = any detection older than now-29 d; replay timestamps < now-1 h; replay refuses partial history (needs `pnpm seed --reset`); import identities kept (volume), ~10 tracked employees left unlinked.
- Stage A derives the access point only when the camera has exactly one camera binding.

## Deviations from plan-04

- Recognition default stayed `RECOGNITION_ENABLED=true` (ruling superseded the earlier dev-compose default idea); seed disables per-camera instead.
- Real throughput is about 0.3 fps per camera on CPU InsightFace; lobby small faces can split into duplicate identities (not fixed).
- Tasks 1, 2, 3, 4, 5, 6 each needed one fix round (6, 4, 6, 3, 9, 10 findings); Task 7 added migration `036` and a test helper parameter (`publishedRule` name).
- Incidents migration `013` is 318 lines (over the ~300 guideline).

## Carry-overs to later slices

- `abnormal_movement` -> slice 7 (needs `area_transitions_daily`).
- `tailgating` and policy-based `restricted_area_entry` -> slice 8 (access decisions, access policies); today restricted entry compares access ranks.
- Segment-scoped rules (`event_rule_version_scopes.segment_id`, no FK yet) -> slice 6.
- `incidents.escalation_policy_id` FK and notifications (stage C) -> slice 5.
- `identity_timeline` must union merged sources (`identity_merge_sources`) -> slice 7.

## Deferred minors

- T2: dangling `note_id` in activity details; rollback skips snapshot restore silently on conflict (count in audit); stale comment in migration 007 about merged source `profile_id`.
- T3: `occupancy_exceeded` uses the live count at evaluation; closed incidents absorb later events silently; stale comments (021 header, `bump_rule_counters`).
- T4: profile deactivation at 03:00 UTC lags west of UTC; lifecycle returns only no_show rows; archiving a `pending_verification` identity leaves its pending request open (cancel it).
- T5: restart overlap of an in-flight frame; vacuous pass when no faces; storage client has no timeout, and a timeout during body read surfaces a raw DOMException.
- T6: seed-test flake risk (health cron writes before `created_at` of recreated cameras).

## Owner actions (not done by the agents)

- **SECURITY (top priority)**: the dev Postgres volume carries attacker persistence: superuser login role `priv_esc` (password in a function body) and event triggers `log_start` / `log_end` (ddl_command_start/end) executing `public.escalate_priv()`, which recreates the role on every DDL; also the ransom database `readme_to_recover` (see slice 3). Port is bound to 127.0.0.1 and no suspicious processes were found, but the DB was NOT remediated (owner's environment). Fix: rebuild the postgres volume (`make db_reset` then `pnpm seed`) or `DROP EVENT TRIGGER log_start, log_end; DROP FUNCTION public.escalate_priv; DROP ROLE priv_esc;`. Rotate ALL secrets (JWT secret, Hasura admin secret, Postgres password, action secret) and audit production Postgres for the same artifacts.
- Prod needs `ACTION_SECRET`, `BACKEND_URL` reachable from Hasura (cron/event triggers, actions), the stream-server reachable from the backend, and redeploy of the compose file without the 5432 publish.
- Nothing is merged to `main`; production untouched.

## How to run

```bash
make dev-compose                      # infra incl. backend, insightface, stream-server
make hasura_apply                     # migrations + metadata (crons, event triggers)
pnpm seed                             # + tracked people, 30-day history replay (several minutes); --reset wipes seed data first
pnpm --filter nhost metadata:generate # after changing metadata-src
pnpm --filter nhost test              # generator tests
pnpm --filter backend exec vitest run src
pnpm --filter backend test:integration
RUN_SEED_TEST=1 pnpm --filter backend test:integration -- seed
```

Live demo: seeded cameras are off. Call the action `recognition_start` (org_admin) with a camera device id (the stream-server must serve its stream); `recognition_status` shows the session; watch Socket.io room `device:<id>` for `detection` events; `recognition_stop` ends it. Kill switch: `RECOGNITION_ENABLED=false` on the backend disables the manager entirely. Live recognition grows the DB; `pnpm seed --reset` cleans it.
