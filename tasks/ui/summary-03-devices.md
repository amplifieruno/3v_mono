# Summary — phase 3: Devices

Plan: `plan-03-devices.md`. Spec: `design.md`. Framework gaps: `buro-gaps.md`.
Branch `feat/ui-console`, commits `3541eef..c96cc26` (tasks 1-3: `58e56e3`, `d1098cc` + `8d41bbe`,
`71c54ab` + `c96cc26`), the devices smoke suite and this summary. Demo video:
`playwright-output/phase-03-devices.webm` (devices list, a camera with its health chart, start
recognition, the live view with face boxes, the live wall, stop; git-ignored like the earlier
videos).

## What was built

All in `apps/admin-ui/`, on buro 0.6.0, in a new `devices` ConsoleModule (`src/modules/devices/`),
nav section Devices (Live wall, Devices, Device health, Device events).

- **Devices** (`device.ts`, `device-fields.ts`, `device-type-fields.ts`, `device-checks.ts`): full
  CRUD with record types by `device_type` (static / PTZ / thermal camera, access terminal, sensor):
  cameras carry the stream and recognition columns, terminals the policy sync columns. The type is
  chosen on create and fixed. List with filters, saved views (Offline, Cameras) and a 30 s refresh;
  show with tabs Details, Live, Stream, Access policies, Areas, Access points, Health, Events. The
  device password is a write-only field (`secret()`); position and coverage are drawn on the floor
  plan.
- **Device areas** (`device-area.ts`): hidden junction ("Also covers"), edited on the Areas tab.
- **Health and events** (`device-health-metric.ts`, `device-event.ts`): read-only cursor-paged logs
  and a timeline; the Health tab shows the chart and the samples.
- **Recognition control** (`recognition.ts`, `recognition-flows.ts`): operations for
  `recognition_status/start/stop`, Start/Stop item flows (show page and row menu, `when` by type and
  state, blocking checks for an inactive camera or no stream URL), and a camera facts header
  (running, frames analysed, detections, last frame, last error).
- **Live camera** (`src/blocks/live-camera/`, `src/realtime/`): the block plays the stream with hls.js
  and draws recognised faces from the backend's Socket.io `detection` messages over it; the
  **live wall** page (`/live-wall`) shows every camera with recognition on.
- **Carry-overs from phase 2 done**: access point bindings link the device resource; devices are
  drawn on the floor-plan block (marker ringed in the health colour, coverage outline).
- **Articles** for device, device area, health sample and device event under `devices/docs/`.

## Reusable for later phases

- **`secret()` field** (`src/fields/secret*.ts(x)`, id `itap.secret`): a password box that leaves
  the value out of the payload while empty (typing sets it), `sensitive: true` (kept out of drafts,
  redacted in audit), never selected or returned (the mapping's `selectFieldsOf` skips `writeOnly`
  fields). For integration secrets and client keys (phases 11-12). G24.
- **Health-chart block** (`itap:health-chart`, `src/blocks/health-chart/`) and its series query
  `deviceHealthSeries` (`health-series-query.ts`): last 24 h folded to 96 points of 15 minutes,
  small multiples per measure, gaps for missing samples, red ticks for failed periods. The
  fold-into-buckets pattern suits any dense time series (G25).
- **Live-camera block** (`itap:live-camera`) and **detections socket service**
  (`src/realtime/detections.ts`, `openDetectionStream`): one Socket.io connection per view,
  `join-device` with ack, token renewal, backoff reconnect, org-switch handling, a generation
  fence. Dependencies injected (`LiveCameraDeps`), hls.js and socket.io-client loaded lazily. Phase 5's
  operator workspace can reuse it for live detections.
- **Live wall page** (`live-wall-page.ts`, `itap:live-wall`).
- **Recognition flows** as a model for status-reading item flows with `onUnknown.check`.
- **`placedOnPlan`** (`plan-rows.ts`, generic marker rows for the floor-plan block) and **device
  markers** in the block.
- **Dev-stack vitest files now run one after another** (`fileParallelism` off with `ITAP_DEV_STACK=1`,
  `vitest.config.ts`): `facilities.dev.test.ts` adds a required facility attribute for a while, which
  refused facilities other files created in parallel (seen as flaky `custom_field_invalid`).

## Rulings (from the ledger)

- Record types per `device_type` with every column declared on the base and hidden per type, so one
  mapping reads all columns (flows read `recognition_enabled`).
- Password through a custom write-only field rather than a "Change password" flow (G24).
- The health chart uses a custom query, not `source.list` (100-row cap; G25).
- `secret()` is `sensitive` (folded in from the Task 1 review).
- Boxes are one per identity per analysed frame and fade after 2 s; a newer frame replaces older
  boxes. The stream is HLS, so boxes (from snapshots) can lead or lag the picture a little.

## Found by the smoke suite

Nothing in the app. One test-infrastructure flake: parallel dev-stack files (above).

## Framework gaps met

G24 no write-only field option (custom `secret()` field plus the mapping rule); G25 a block's
`source.list` reads at most 100 rows (custom series query); G26 a `source.list` condition cannot
take a list value, so the live wall cannot narrow by `device_type in [...]` (only cameras can have
recognition on, so the condition is left out). Details: `tasks/ui/buro-gaps.md`.

## Deferred

- Minors: floor-plan devices / access points read at most 100 without a truncation notice;
  `device_type` is create-only; seeded devices have no positions; the box fade ignores
  `prefers-reduced-motion`; a stream flagged "stalled" after 8 s without waiting may mislabel a
  healthy one (also clear on `timeupdate`); the wall opens one socket per tile; HLS lag offsets
  boxes from faces.
- The e2e needs insightface up for the box step (it is detected through `INSIGHTFACE_URL`, default
  `http://127.0.0.1:18080`; the step is skipped with an annotation when it is down).
- Controller-written plans for phases 6-8 are committed with this summary:
  `plan-06-notifications.md`, `plan-07-segments.md`, `plan-08-analytics.md`.

## Gates

Unit/jsdom 338 passed (38 dev-stack skipped, 51 files); with `ITAP_DEV_STACK=1` 375 passed (1
skipped, 64 files); e2e 28 passed (auth, foundation, organization, places, devices 6). Lint,
typecheck and build clean.

## How to run

```bash
make dev-compose && pnpm seed                      # dev stack and demo data (insightface for boxes)
pnpm --filter admin-ui dev                         # console on http://127.0.0.1:5173
pnpm --filter admin-ui lint && pnpm --filter admin-ui typecheck
pnpm --filter admin-ui test                        # unit/jsdom
ITAP_DEV_STACK=1 SEED_PASSWORD=... pnpm --filter admin-ui test       # + dev-stack tests
ITAP_DEV_STACK=1 SEED_PASSWORD=... pnpm --filter admin-ui test:e2e   # + devices smoke
pnpm --filter admin-ui build
```

`SEED_PASSWORD` is in `apps/backend/.env`. Sign-in limits are as in `summary-02-places.md`. The
devices e2e starts recognition on the seeded "Lobby Camera" and always stops it again.
