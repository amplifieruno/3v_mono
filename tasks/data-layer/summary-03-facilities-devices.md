# Slice 3 summary: Facilities, areas, devices, health

Branch `feat/data-layer-foundation`: commits `cd4f96c..HEAD` (`61d548e` .. `baca686` plus the Task 6 carry-over/docs commit). Spec: `design.md` (§6.6, §6.7, §8.3); plan: `plan-03-facilities-devices.md`.

## What was built

**Tables (migrations `1792365600000`..`018`; Task 6 adds `019`)**
- Validation helpers `itap.valid_windows`, `valid_point`, `valid_shape` (migration `000`); `work_schedules.windows` now uses `valid_windows` (`001`).
- Facilities: `facilities` (+ statuses), `areas` (materialised-path hierarchy, types/statuses/access levels, `shape` jsonb, same-facility unique key), `floor_plans` (image file in the org bucket, `image/%` mime check). Computed field `areas.current_occupancy` (0 until `area_occupancy` exists in slice 4); function `area_descendants`.
- Access points: `access_points` (+ kinds/directions), `access_point_devices` (+ device roles), `device_areas` (extra covered areas).
- Devices: `devices` (+ types/statuses/health statuses; `stream_url` without credentials), `identity_photos.device_id` FK (left FK-less in slice 2), `facility_templates`.
- Telemetry: `device_health_metrics`, `device_events` (+ event kinds), append-only, no audit trigger.
- SQL functions: `apply_facility_template` (volatile, exposed as a Hasura mutation to `org_admin`), `record_device_health` (admin only; writes metrics, health_status, last_seen_at, status, events).

**Backend**
- `src/events/`: Hasura event/cron trigger router `POST /hasura/events/<name>` with the `x-action-secret` check, payload validation, registry (`defaultEventHandlers`), idempotency key.
- Crons (generated from `metadata-src/crons.ts`, new `CronSpec.toleranceSeconds`): `heartbeat` (5 min), `device_health_check` (1 min, tolerance 120 s): probes the stream-server snapshot per camera (concurrency 5, 3 s timeout), calls `record_device_health`.
- Seed: Nova Tower facility with a 20-floor-style area tree and floor plan images (`facilityPlan.ts`, `floorPlans.ts`), access points and devices (`devicePlan.ts`; cameras bound to stream ids `entrance`/`lobby`/`serverroom`/`warehouse`), device health history (`deviceHealthPlan.ts`), identity photo -> device mapping.

**Generator**: `CronSpec` (schedule, retry, toleranceSeconds), same-facility composite FK and covering-index checks reused.

## Task 6: slice-2 carry-overs

- `packageManager: pnpm@9.15.9` pinned in the root `package.json`; `apps/admin-ui/Dockerfile` uses `pnpm@9.15.9` (was `pnpm@latest`).
- Enrollment maps the SQL guard errors `identity_matching_disabled` / `identity_merged_frozen` (Hasura errors on photo/embedding inserts) to coded `EnrollmentError` -> `ActionError` (`src/face/guardErrors.ts`, unit test).
- `itap.decide_verification` restores the previous `verification_context` value instead of forcing `off` (migration `019`; integration test `verification-context.test.ts`, RED for `on` before the migration).

## Rulings (from the ledger)

- `apply_facility_template` is a volatile SQL function exposed as a Hasura mutation to `org_admin`, no backend action (spec §8.0: no external service) - cost: none.
- Configurable cron tolerance (`CronSpec.toleranceSeconds`); `device_health_check` uses 120 s so outages do not replay hours of probes - cost: none.
- T1 review fix folded: statement-level guard `area_multi_parent_move` (multi-row re-parent to different parents could create cycles/stale paths), distinct shape points, floor plan image mime `image/%`, extra tests (no-org session, cross-org move/insert).
- T3 carry: templates are an array of root nodes; capacity cast `::numeric::int`.

## Deviations from plan-03

- Added `toleranceSeconds` to the cron generator (plan had a fixed default).
- Task 1 needed one fix round (4 findings, commits `61d548e..603aa94`); Tasks 2-5 had clean reviews.
- `access_points.status` reuses `area_statuses`; `access_points` and `access_point_devices` share one migration.

## Deferred minors

- T1: ancestor lock-order note.
- T2: test negatives without message checks; password aggregate/filter denial test.
- T3: archived facility/parent accepts templates; atomicity test is tautological.
- T4: vacuous cross-org telemetry test; critical->warning emits online+error (pin or single event); unconditional devices update bumps `updated_at` every tick (live-update noise); stale-sample path untested.
- T5: non-stream devices have stale `last_seen_at` (no producer); `cameraPhotos` re-derives the mapping (share helper); turnstile positions gap; parking incident story; no weekly pattern; a misleading test comment.

## Owner actions (not done by the agents)

- **Security (still open from slice 2)**: dev Postgres contained database `readme_to_recover` (ransom note, 2026-02-16); left untouched as evidence. Treat all dev secrets as leaked (rotate `JWT_SECRET`, Hasura admin secret, Postgres password) and check the production Postgres for the same note.
- The 5432 publish was removed from `docker-compose.prod.yml` only in the repo: redeploy prod to take effect.
- Prod env needs `ACTION_SECRET`, `HASURA_JWT_SECRET`, `NHOST_STORAGE_URL`, and now `BACKEND_URL` reachable from Hasura for cron triggers (`/hasura/events/*`) plus the stream-server reachable from the backend for health probes.
- Nothing is merged to `main`; production untouched.

## How to run

```bash
make dev-compose                       # infra incl. backend, insightface, stream-server
make hasura_apply                      # migrations + metadata (crons included)
pnpm seed                              # + facilities, devices, health history (--reset wipes seed data first)
pnpm --filter nhost metadata:generate  # after changing metadata-src (tables, functions, crons)
pnpm --filter nhost test               # generator tests
pnpm --filter backend exec vitest run src
pnpm --filter backend test:integration
RUN_SEED_TEST=1 pnpm --filter backend test:integration -- seed   # opt-in seed test
```
