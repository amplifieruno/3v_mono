# Data Layer Slice 4 — Recognition, Detections, Tracking, Events, Incidents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live camera recognition writes detections; a SQL pipeline turns detections into tracking state (sessions, locations, occupancy) and state-change events; event rules (versioned) and incidents with escalation hooks; watch lists (watch/blacklist/vip) with `profiles.is_blacklisted`; visits; dwell-rule cron; and 30 days of history produced by replaying detections through the real pipeline.

**Architecture:** Builds on slices 1–3 (summaries 01–03, `.claude/rules/hasura-conventions.md`). Spec §8.2 is the contract: Stage A (AFTER INSERT on `detections`, same transaction, bounded) maintains tracking state; Stage B (Hasura event trigger on `detections` → backend → SQL `evaluate_detection(detection_id)`) emits events on state changes only with dedup keys; event rules in scope set severity and may create incidents. Notification fan-out (Stage C) is slice 5. All time logic uses the row's own timestamp, never `now()`.

**Tech Stack:** Postgres 16, Hasura v2.46 event/cron triggers, Express/TypeScript, InsightFace-REST, stream-server snapshots, Socket.io (live push), vitest.

**Spec:** `tasks/data-layer/design.md` — §6.2 (visits), §6.4 (`is_blacklisted`), §6.8, §6.9, §6.0 (versioned entities pattern, time, deletion policy), §7 (recognition), §8.0, §8.2, §8.3 (`close_stale_sessions`, `evaluate_dwell_rules`), §9.

## Global Constraints

- All conventions so far apply (`.claude/rules/hasura-conventions.md` binding; summaries 01–03).
- `detections`, `identity_locations`, `area_occupancy`, `events` are append-only/system-written: **ro** for org_admin (select only), not audited, created_at only (area_occupancy is mutable state: updated by SQL only).
- Log-to-log links (`events.detection_id`, `identity_locations.detection_id`, `incident_events.event_id`) are plain indexed uuid columns without FK (spec §4.1 exception); FKs to stable entities (devices, areas, identities, profiles, facilities, access points, rule versions) composite with `ON DELETE SET NULL (col)` per §6.0.
- Events are state changes: dedup keys `session:<id>:<type>`, `session:<id>:<type>:<area_id>`, `ap:<id>:<type>:<bucket>`, `occupancy:<id>:<type>`; `unique(organization_id, dedup_key)`.
- Recognition stores a new embedding only if it beats the worst of the identity's top-5 templates (spec §7) — enrollment keeps storing all (documented in slice 2).
- Recognition threshold: `organization_settings.recognition_threshold`; set the seeded Nova Tower value to **0.40** to avoid the known false blacklist match (slice 2 ledger).
- Versioned event rules: header `event_rules` + `event_rule_versions` (draft/pending_approval/published/superseded) owning `event_rule_version_scopes` (exactly-one facility/area/segment — segments table arrives in slice 6: create the column without FK now, add the FK in slice 6); publishing flips `current_version_id`.
- `incidents` code `INCIDENT`; status `open/acknowledged/investigating/resolved/closed`; disposition; `escalation_policy_id` column without FK until slice 5.
- Seed history is produced by replaying detections in time order through Stage A + `evaluate_detection` (not by inserting sessions/events directly), except estimated locations.

## Review Focus

1. One person standing in front of a camera for 10 minutes at 2 fps produces many detections but exactly one `detection_known` (and one `vip_arrival`/`blacklist_match` where applicable) for that session.
2. A detection arriving late (older `detected_at` than the session's `last_detected_at`) must not reopen/close sessions incorrectly or emit a duplicate.
3. Hasura redelivering the same Stage B event (at-least-once) produces no duplicate events or incidents.
4. Two camera sessions in different facilities for the same identity at the same time are independent (partial unique per identity+facility).
5. A blacklisted person (watch list kind `blacklist`) detected → `blacklist_match` event with severity from the list, an incident when the rule says so, and `profiles.is_blacklisted = true`.

---

### Task 1: Detections, tracking tables, Stage A

Migrations: `detections` (spec §6.8 + `access_point_id` from access_point_devices camera binding, `thumbnail_file_id` + check_file_bucket), `tracking_sessions` (+ `last_detected_at`, `last_area_id`, `last_access_point_id`, `visit_id` uuid no FK until Task 4, partial unique `(organization_id, identity_id, facility_id) where status='active'`), `identity_locations` (`unique(detection_id)`), `area_occupancy` (`unique(organization_id, facility_id, identity_id)`, `session_id`), enums `tracking_session_statuses`, `movement_types`; Stage A trigger function `itap.track_detection()` (spec §8.2 Stage A: throttled identity counters using `organization_settings.detection_counter_throttle_seconds`, session open/extend/close-on-timeout with the `is_entry_exit` rule, location + occupancy on area change, late detections handled per Review Focus 2); replace `areas.current_occupancy` computed field body (subtree count via `path`) and add `facilities.current_occupancy`. Tests: `tracking.test.ts` (Review Focus 2, 4; timeout close; exit vs lost; occupancy moves).

### Task 2: Watch lists, events, event rules (versioned), incidents

Migrations: `watch_lists` (kind enum `watch_list_kinds`: watch, blacklist, vip; severity; color), `watch_list_entries` (exactly-one identity/profile; expires_at), computed field `profiles.is_blacklisted` (active, unexpired blacklist entry for the profile or any of its identities); `event_types` enum (full list from spec §6.9), `event_severities` enum + `itap.severity_rank(text)`; `events` (spec §6.9 columns + session_id, rule_version_id); `event_rules` + `event_rule_versions` + `event_rule_version_scopes` (versioned pattern; `version_published` trigger reused/generalised from spec §8.1 — implement `itap.publish_version(...)` helpers as needed) with rule types from spec §6.9; `incidents` (code INCIDENT, spec §6.9 columns), `incident_events`, `incident_identities`, `incident_notes`, `incident_note_files`, `incident_activities` (ro; trigger `incident_activity_log` on status/assignment changes), `shift_handovers`, `shift_handover_incidents`, `operator_workspaces`; member FKs with `active_member_check` where assignable; mutation functions `acknowledge_incident`, `resolve_incident`, `escalate_incident` (manual step bump; slice 5 sends), `publish_event_rule_version`. Tests: permissions (ro tables), versioning, incident lifecycle + activities, is_blacklisted.

### Task 3: Stage B — evaluate_detection + event trigger + dwell cron + stale sessions cron

SQL `itap.evaluate_detection(p_detection uuid)` (admin-only function): per spec §8.2 Stage B — session-opened events (`detection_known/unknown`, watch list kinds → `watchlist_match/blacklist_match/vip_arrival`, `inactive_profile_detected`, `unexpected_facility`, `after_hours` via `in_windows(operating_hours, facility tz, detected_at)`), area-entered events (`restricted_area_entry` using area access rank vs profile clearance rank (`itap.access_rank`) — published access policies arrive in slice 8, so for now rank-only; `abnormal_movement` vs `area_transitions_daily` — table arrives in slice 7: treat as "no history" → skip until then; `occupancy_exceeded`), access-point events (`tailgating` vs `access_granted` decisions — decisions arrive in slice 8: skip until then); then published rule versions in scope set severity/rule_version_id and create incidents (`creates_incident`) with incident_events/incident_identities; idempotent via dedup keys (Review Focus 1, 3). Event trigger `detection_created` on detections insert → backend handler calls the function (admin). Device platform events (spec §8.3, carried from slice 3): `itap.record_device_health` transitions also insert platform `events` (`device_offline`, `device_online`, `device_error`) with dedup key `device:<id>:<type>:<checked_at>` — extend the function in a new migration and test. Crons: `evaluate_dwell_rules` (1 min: loitering/unusual_dwell from area_occupancy durations vs `areas.loitering_threshold_seconds` / rule params), `close_stale_sessions` (2 min). Tests: Review Focus 1, 3, 5; after-hours; restricted area; dwell; stale close.

### Task 4: Visits

Migration `visits` (spec §6.2: code VISIT, visitor_profile_id (must be profile_type visitor), host_profile_id, company_id, purpose, expected_start/end, checked_in_at, checked_out_at, status enum `visit_statuses`, badge_number); FK `tracking_sessions.visit_id`; Stage A links the session to a checked-in or scheduled visit of that day; mutation functions `check_in_visit`, `check_out_visit`; `lifecycle_jobs` daily cron part for no-show visits (status `no_show` when expected_end passed without check-in) and visitor profile deactivation when end_date passed. Tests.

### Task 5: Recognition pipeline port

Backend `apps/backend/src/recognition/`: manager (polls devices with `recognition_enabled` across orgs every 10 s; one session per device), session (fetch snapshot from stream-server every `1000/recognition_fps` ms, InsightFace extract, per face: crop → org bucket kind `capture`… store only when creating/updating identity photos, `match_face` via a session-carrying client for the device's org with `recognition_threshold`, unknown → create identity (source camera) via the enrollment service's camera path, known → optionally add embedding if it beats the worst template, insert `detections` row (frame size, bbox, quality, thumbnail optional)), Socket.io push `detection` events to room `device:<id>` (shape documented), Actions `recognition_start/stop/status(device_id)` (toggle `recognition_enabled`, return live stats). Per-device backpressure (drop frame if previous still processing; no global lock). Tests: unit (session loop with stubs), integration (enable a seeded camera briefly → ≥1 detection row and events produced through Stage B).

### Task 6: Seed history replay

Seed step generating 30 days of plausible movements for seeded identities (employees on office days through entrance → lobby → floor; visitors via reception; VIP arrivals; the blacklisted persona twice; unknown faces; after-hours few; a tailgating-free history) as detections in time order, inserted in batches so Stage A runs, then `evaluate_detection` called for each (or via the event trigger — synchronous call preferred for determinism); estimated locations inserted directly for a few gaps; incidents with notes/activities from the produced events; watch lists (Blacklist with the persona, VIP list), event rules (published: after_hours, restricted_area, blacklist, vip arrival; one draft), visits (scheduled/checked-in/out/no-show), shift handovers, operator workspace. Set Nova Tower recognition_threshold 0.40. Idempotent (skip when history exists) and reset-safe; volumes: thousands of detections, not millions.

### Task 7: Docs, summary, gates

Update CLAUDE.md, roadmap (plan-04 link), conventions (pipeline stages, dedup keys, versioned entity helper), write `summary-04-detections-events.md`; all gates; commit and push.
