# ITAP Console Phase 3 — Devices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Device management (cameras, terminals, sensors) with health history and device events, the
live camera view with real-time recognition overlay, and recognition start/stop/status.

**Architecture:** A new `devices` ConsoleModule following the conventions in `summary-00`/`01`/`02`.
The live view is a buro block (`itap:live-camera`) that plays the stream-server HLS stream
(`/streams/<stream id>/live.m3u8`, stream id = last path segment of `devices.stream_url`) and draws
detection boxes received over the backend Socket.io room `device:<id>`, authenticated with the
organization token. Recognition control = item flows over Hasura actions. Health = read-only resources
plus a chart block.

**Tech Stack:** as before, plus `socket.io-client` and `hls.js` (both lazy-loaded inside the live
camera block's `load` so they stay out of the initial bundle). Charts: plain SVG (no chart library).

**Spec:** `tasks/ui/design.md` §6.4 (live camera block, socket, `refetchInterval`); data model
`tasks/data-layer/design.md` §6.7, §7 (recognition), §8.3 (`device_health_check`).

## Global Constraints

- Everything in earlier plans' Global Constraints and `.superpowers/sdd/IMPLEMENTER-CONTEXT.md` applies.
- Dev proxy: add `/streams` → `http://localhost:8888` in `vite.config.ts` and the prod nginx config
  (stream-server service name from `docker/docker-compose.prod.yml`); `/socket.io` already proxied.
- Socket protocol (`apps/backend/src/recognition/socket.ts`): `io(origin, { path: '/socket.io', auth: { token } })`,
  `join-device` / `leave-device` with ack `{ ok } | { ok: false, error }`, server event `detection`
  (`DetectionMessage` in `apps/backend/src/recognition/types.ts`), server disconnects on token expiry →
  reconnect with a fresh token from `getToken()`; on organization switch the socket is closed and reopened.
- `devices.password` is a secret column: writable, never selectable — an edit form shows a "set new
  password" input that is left out of the payload when empty.
- Logs (`device_health_metrics`, `device_events`) are append-only: `operations` all off,
  `noAggregate` + `count: 'manual'` + cursor pagination where the sort allows (fix the phase-0 schema
  test so `noAggregate` is honoured — ledger minor from phase 0).
- Device lists poll with `views.list.refetchInterval` (health changes every minute) until buro ships
  the live-socket fix (G3).

## Review Focus

1. The organization token expires while the live view is open: the socket reconnects with a fresh
   token and boxes keep coming. — Task 3 test.
2. Switching organization while a live view is open closes the old socket (no boxes from the previous
   organization). — Task 3 test.
3. Editing a device without touching the password never sends `password`. — Task 1 test.
4. A camera whose stream is down shows a clear "stream unavailable" state, not a black box. — Task 3 test.
5. Starting recognition on a non-camera device is not offered; start/stop reflect the real status
   after the action returns. — Task 2 test.

---

### Task 1: Devices resource (+ device areas link), enums, docs

Carry-overs from phase 2: fill the device relation on `access_point_device` (bd 3v_mono-5t6) with a read link `f.relationMany({ through })` on access point; show devices on the `itap:floor-plan` block (data entry for positioned devices of the plan's areas, icon by device type and health). Use the shared `src/data/resource-names.ts`, the facility-scope guard test and the dev-stack globalSetup from the phase 2 final fixes; in `tests/support/dev-sessions.ts` import `NOVA_NAME` from `dev-hosts.ts` instead of the hard-coded organization name.

Resource `device` (table `devices`): name, code (system), device_type, facility_id, area_id (candidates
same facility), position (`planPosition({ areaField: 'area_id' })`), coverage (`areaShape({ areaField: 'area_id' })` — check `itap.valid_shape` applies to device coverage), stream_url, resolution, fps,
status, health_status/last_seen_at (system), manufacturer, model, firmware_version, ip_address,
configuration (json), custom_fields (`customFields({ entity: 'device' })`), recognition_enabled
(system — changed only through the flows), recognition_fps, username, password (secret write-only
input), policy sync columns (system). `data.scope` facility. Record types by `device_type` if the
fields differ enough (cameras: stream/recognition; terminals: policy sync) — use buro `types`.
Junction `device_area` (`device_areas`) as hidden resource + read link `f.relationMany({ through })`
on device ("Also covers"). List: columns, filters (type, status, health, facility), saved views
("Offline", "Cameras"), `refetchInterval: 30000`. Fill the phase-2 access-point device relation now
that devices exist. Docs + article. Commit `feat(ui): devices`.

### Task 2: Health, events, recognition control

Resources `device_health_metric` and `device_event` (read-only logs, cursor lists, filters).
Block `itap:health-chart` (SVG sparkline/area chart of cpu/memory/latency/frame rate over the last
24 h for one device, data via `source.list` sorted by `recorded_at`), placed on the device show
`health` tab with a `relatedList` of metrics; `events` tab = timeline `relatedList` of device events.
Recognition: `recognitionStatus = defineQuery` (`recognition_status`), `recognitionStart` /
`recognitionStop = defineMutation` (effects: device), item flows "Start recognition" / "Stop
recognition" with `when` on `device_type` camera and current `recognition_enabled`; status shown with
`facts` on the camera show header. Commit `feat(ui): device health, events and recognition control`.

### Task 3: Live camera block

`src/blocks/live-camera/*`: `itap:live-camera` block (props `deviceId`; `load`-implemented view that
dynamically imports `hls.js` and `socket.io-client`), video element playing the HLS stream, SVG overlay
of detection boxes scaled from `frameWidth/frameHeight`, labels (profile name / identity code / "New"),
fade-out after 2 s, counters; a socket service `src/realtime/detections.ts`
(`openDetectionStream({ deviceId, getToken, onDetection, onState }) → { close() }`) handling auth,
join/ack errors, token-expiry reconnect and close-on-org-switch (subscribe to the token store).
Placed on the camera show `live` tab and on a custom page `live-wall` (grid of all recognition-enabled
cameras of the selected facility). Tests: socket service with a fake socket (Review Focus 1, 2), view
states (Review Focus 4). Commit `feat(ui): live camera view with recognition overlay`.

### Task 4: Phase close

e2e `devices.spec.ts` (create/edit a device without password change, start/stop recognition on a seeded
camera and see status, open the live view and see the video element playing or the unavailable state,
see a detection box after starting recognition when insightface is up — skip with a note if not),
gates, demo `playwright-output/phase-03-devices.webm`, `summary-03-devices.md`, gaps/roadmap, push.
