# Data Layer Slice 3 — Facilities & Devices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Facilities, area hierarchy (incl. virtual zones/geofences), floor plans, access points, devices with secret credentials, device health metrics and events, facility templates — plus the backend infrastructure for Hasura cron and event triggers, with a real `device_health_check` cron.

**Architecture:** Same as slices 1–2 (`summary-01-foundation.md`, `summary-02-identity-profile.md`, `.claude/rules/hasura-conventions.md`). New: a `/hasura/events/:name` router for Hasura event and cron triggers (same secret header as actions), handlers idempotent; cron jobs call SQL functions per organization.

**Tech Stack:** Postgres 16, Hasura v2.46 cron/event triggers, Express/TypeScript, stream-server (OpenResty HLS: `/health`, `/streams/<id>/snapshot.jpg`), vitest.

**Spec:** `tasks/data-layer/design.md` — §4.1 (same-facility composite FKs), §6.0 (time/windows, deletion policy), §6.6, §6.7, §8.0, §8.3 (`device_health_check`), §9 (seed: Nova Tower layout).

## Global Constraints

- All slice 1–2 constraints and conventions apply (`.claude/rules/hasura-conventions.md` is binding).
- Same-facility consistency via composite FKs `(organization_id, facility_id, x_id)` for `areas.parent_id`, `floor_plans.area_id`, `access_points.area_id/from_area_id`, `devices.area_id`, `device_areas`; parents carry `UNIQUE (organization_id, facility_id, id)`.
- `areas.path uuid[]` and `depth` are trigger-maintained (**ro**), cycles rejected (`area_cycle`), path recomputed for the whole subtree on re-parent.
- Area occupancy and facility area counts are computed fields (no stored counters; occupancy source table arrives in slice 4 — until then computed fields return 0 from an empty-safe function).
- Shapes: GeoJSON-like jsonb in floor-plan pixel space: `{type:'Polygon', coordinates:[[[x,y],…]]}` or `{type:'Circle', center:[x,y], radius:r}`; validated by `itap.valid_shape(jsonb)` CHECK.
- Windows: introduce `itap.valid_windows(jsonb)` (each entry `{days:int[1..7] non-empty, from:'HH:MM', to:'HH:MM'|'24:00'}`) and add CHECKs on `facilities.operating_hours` and the existing `work_schedules.windows` (slice-2 deferred item).
- Device credentials: `username` writable, `password` **secret** (writable, never selectable, redacted in audit).
- Health data (`device_health_metrics`, `device_events`) is append-only, **ro**, not audited.
- Event/cron handlers: idempotent; retries configured in metadata (`num_retries: 3`, `retry_interval_seconds: 10`, `timeout_seconds: 60`); handler URL `{{BACKEND_URL}}/hasura/events/<name>`, header `x-action-secret: {{ACTION_SECRET}}`.

## Review Focus

1. Re-parenting an area under its own descendant: rejected with `area_cycle`, no partial path updates.
2. An area or device pointing to an area of another facility (same org): rejected by the composite FK.
3. A device going offline then online again: exactly one `device_offline` and one `device_online` device_event per transition (not one per cron tick).
4. Cron running while the stream-server is down entirely: devices transition to `critical`/offline once, the handler doesn't crash or flood.
5. Deleting a facility with areas/devices: blocked (NO ACTION) unless empty; archiving via status works.

---

### Task 1: Validation helpers, facilities, areas (tree), floor plans

**Files:** migrations for `itap.valid_windows`, `itap.valid_shape`, CHECK on `work_schedules.windows`; enums `facility_statuses` (active, inactive, maintenance), `area_types` (building, floor, zone, room, sector, entrance, corridor, parking, virtual_zone), `area_access_levels` (public, restricted, secure, classified), `area_statuses` (active, inactive, maintenance); tables `facilities` (spec §6.6 columns: number/code `FACILITY`, name unique per org, description, address, latitude/longitude numeric with range CHECKs, timezone with `is_valid_timezone`, status, operating_hours windows, contact jsonb, custom_fields + `validate_custom_fields('facility')`), `areas` (facility_id, parent_id, path ro, depth ro, name, description, area_type, access_level, capacity int ≥0, shape, loitering_threshold_seconds, status; trigger `areas_maintain_path`), `floor_plans` (facility_id, area_id unique (the floor), name, image_file_id + check_file_bucket, width_px, height_px, scale_m_per_px, level); computed fields `facilities.areas_count`, `areas.current_occupancy` (returns 0 until slice 4 wires `area_occupancy`), function `itap.area_descendants(hasura_session, p_area)` query (result table `itap_results.area_refs`); audit triggers. Metadata: `apps/nhost/metadata-src/facilities.ts`. Tests: `facilities.test.ts`, `areas-tree.test.ts`.

- [ ] Failing tests: facility code `FACILITY-00001`; invalid windows / shape / lat-long rejected; area path & depth for a 4-level tree; re-parent moves subtree paths; cycle → `area_cycle` (Review Focus 1); parent in another facility → FK error (Review Focus 2); area_descendants returns the subtree, org-scoped; floor plan per floor unique; facility delete blocked while areas exist (Review Focus 5); work_schedules with malformed windows now rejected.
- [ ] Implement, generate, apply; tests pass; commit `feat(hasura): Add facilities, area hierarchy and floor plans`.

### Task 2: Access points, devices, device areas, facility templates

**Files:** enums `access_point_kinds` (door, turnstile, gate, elevator, reception), `access_point_directions` (in, out, both), `device_types` (static_video_camera, ptz_camera, thermal_camera, access_terminal, sensor), `device_statuses` (active, inactive, error, maintenance, connection_error), `device_health_statuses` (healthy, warning, critical, unknown), `access_point_device_roles` (camera, terminal, sensor); tables `access_points` (spec §6.6), `devices` (spec §6.7 incl. number/code `DEVICE`, facility_id, area_id, position, coverage (valid_shape), stream_url, resolution, fps, status, health_status ro, last_seen_at ro, manufacturer, model, firmware_version, ip_address inet, configuration, custom_fields + validate('device'), recognition_enabled, recognition_fps 1..5, username, password **secret**, policy_version_synced ro, policy_synced_at ro), `device_areas`, `access_point_devices` (role; a device bound to an access point must be in the same facility); `facility_templates` (name, description, structure jsonb validated by a CHECK function: tree of `{name, area_type, access_level?, capacity?, children?}`); add FK `identity_photos.device_id → devices` (composite, SET NULL (device_id)) deferred from slice 2. Tests: `devices.test.ts`, `access-points.test.ts`.

- [ ] Failing tests: device code; password writable but not selectable and redacted in audit; area from another facility rejected; device_areas same-facility; access point device binding; template structure validation; identity_photos.device_id FK works and SET NULL on device delete.
- [ ] Implement; commit `feat(hasura): Add access points, devices and facility templates`.

### Task 3: Event/cron trigger infrastructure + apply_facility_template action

**Files:** `apps/backend/src/events/router.ts` (`eventsRouter(env, handlers)`: same secret check as actions, payload types for Hasura event triggers `{event:{op,data:{old,new},session_variables}, trigger:{name}, id}` and cron triggers `{scheduled_time, payload, name, id}`; handler errors → 500 so Hasura retries; idempotency helper), mount in `app.ts`; generator or hand-written `cron_triggers.yaml` / per-table `event_triggers` support (decide: event triggers live in table metadata — extend TableSpec with `eventTriggers?: {name, operations, columns?, webhook}`; cron triggers in a registry `metadata-src/crons.ts` → `cron_triggers.yaml`); `apps/backend/src/actions/facilityTemplates.ts` — Action `apply_facility_template(template_id: uuid!, facility_id: uuid!, parent_area_id: uuid): AppliedTemplate!` → creates the area tree in one SQL function `itap.apply_facility_template(hasura_session, …)` (mutation function, atomic) — the action may simply be the SQL function exposed directly (prefer that; no backend needed). Tests: unit tests for the events router; integration `apply-template.test.ts`; a smoke cron (`noop_heartbeat` every minute → writes nothing, returns ok) to prove wiring, removed or kept disabled after.

- [ ] Failing tests; implement; commit `feat(backend): Add Hasura event/cron trigger infrastructure and facility templates`.

### Task 4: Device health check cron

**Files:** `apps/backend/src/events/deviceHealthCheck.ts`; SQL function `itap.record_device_health(p_device uuid, p_reachable bool, p_latency_ms real, p_frame_ok bool, p_checked_at timestamptz)` (internal, admin-only; writes `device_health_metrics`, updates `health_status`/`last_seen_at`/`status` transitions and inserts `device_events` `online/offline/error` only on transitions — Review Focus 3); cron `device_health_check` every minute: for each active camera with a stream_url (all orgs), probe stream-server `/health` once and `GET /streams/<id>/snapshot.jpg` per device (timeout 3 s, concurrency ≤ 5), then call the SQL function; non-camera devices: synthetic heartbeat = unchanged (no data). Tests: unit (probe mapping, timeouts), integration calling the handler directly with a stub stream URL (unreachable host) and with the real stream-server for a seeded camera.

- [ ] Failing tests (incl. Review Focus 3 & 4); implement; commit `feat(backend): Add device health check cron`.

### Task 5: Seed — Nova Tower layout and devices

**Files:** `apps/backend/src/seed/facilities.ts` (+ plan module): Nova Tower facility (24 floors modeled as: building → Lobby (entrance, turnstiles, reception), Floors 2–24 grouped sensibly (each tenant's suite as rooms on its floor; keep ≈60 areas), Server Room (secure), Executive Floor 24 (restricted), Parking (−1, −2), a `virtual_zone` geofence around the loading dock); floor plans for Lobby, Floor 12 and Parking (generated PNGs via sharp: simple rectangles + labels, stored in org bucket); access points (main turnstiles ×4, reception, server-room door, executive-floor door, parking gate, loading dock); devices: the 4 stream-server cameras (`entrance`, `lobby`, `serverroom`, `warehouse` → mapped to Main Entrance, Lobby, Server Room, Loading Dock/Warehouse) with `stream_url rtsp://…/<id>` as today, + access terminals and sensors without streams; device ↔ access point bindings; one facility template ("Standard office floor"); Riverside: 1 facility, 5 areas, 2 devices. Also re-point seeded identity photos' device_id where meaningful (camera identities → the camera). 30-day device health history: insert directly (no live producer for the past) — hourly metrics per camera with plausible values and a couple of offline incidents (device_events). Idempotent; reset-safe.

- [ ] Failing seed test (opt-in) for counts/idempotency; implement; run `pnpm seed`; commit `feat(backend): Seed Nova Tower layout, devices and health history`.

### Task 6: Docs, summary, gates

Also carried from slice 2: pin `packageManager: pnpm@9.15.9` in root package.json and use it in `apps/admin-ui/Dockerfile` (not `pnpm@latest`); enrollment maps SQL guard errors `identity_matching_disabled`/`identity_merged_frozen` to coded ActionErrors; `decide_verification` restores the previous `verification_context`. Update `CLAUDE.md`, roadmap (plan-03 link), conventions (events/cron pattern, same-facility FK pattern, valid_shape/valid_windows), write `summary-03-facilities-devices.md` from the ledger; run all gates; commit and push the feature branch.
