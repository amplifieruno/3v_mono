# ITAP console — summary of all phases

The new ITAP console (`apps/admin-ui/`) is built on buro (`@burojs/*` 0.6.0, every package pinned
exactly) over the Hasura data layer. It has 13 phases (0–12) on branch `feat/ui-console`. Spec:
`design.md`; plan per phase `plan-NN-*.md`; summary per phase `summary-NN-*.md`; rulings per phase
`rulings-NN-*.md` (0–11; phase 12's are in its summary); framework gaps `buro-gaps.md`; status
`roadmap.md`.

## Phases

| # | Phase | What it delivered | Summary |
|---|---|---|---|
| 0 | Foundation | App skeleton, auth with the org token, the shell, the organization and facility switch, the Hasura mapping and schema test, custom operations, enums, the file field, i18n, docs and Help, the organization profile, members and invitations | [summary-00](summary-00-foundation.md) |
| 1 | Organization | Organization settings, companies, work schedules (time windows), custom attribute definitions, my preferences | [summary-01](summary-01-organization.md) |
| 2 | Places | Facilities, the area tree, floor plans with area shapes and positions, access points, facility templates (apply with preview) | [summary-02](summary-02-places.md) |
| 3 | Devices | Devices and their areas, health metrics and chart, device events, the live camera view with recognition overlay, live wall, recognition start/stop | [summary-03](summary-03-devices.md) |
| 4 | People | Profiles: documents, consent, restriction, duplicates and merge. Identities: photos, enrollment, merge/rollback/split, verification, relationships. Visits with check-in/out | [summary-04](summary-04-people.md) |
| 5 | Monitoring | Detections, tracking sessions, locations, occupancy, events, event rules (versions), incidents (lifecycle, notes, timeline), watch lists, shift handovers, the operator workspace | [summary-05](summary-05-monitoring.md) |
| 6 | Notifications | Rules (with a dry-run test), templates, recipient groups, escalation policies, on-call, subscriptions, the inbox and bell, delivery logs and report, webhooks | [summary-06](summary-06-notifications.md) |
| 7 | Segments | Manual and dynamic segments, the conditions editor over `segment_fields` with a live preview, evaluation, membership history, daily stats, templates | [summary-07](summary-07-segments.md) |
| 8 | Analytics | The Analytics page, dashboards (renderer and editor), occupancy, flow, heatmap and timeline blocks, reports (templates, schedules, files, retry), stats views | [summary-08](summary-08-analytics.md) |
| 9 | Search & bulk | Face and attribute search (upload and webcam), history, saved searches with Run now, bulk jobs followed row by row (retry/cancel) | [summary-09](summary-09-search.md) |
| 10 | Access control | Access policies (versions, four-eyes approval, simulation), grants, emergency overrides, decisions, terminal sync and publish | [summary-10](summary-10-access.md) |
| 11 | Face authentication | Client applications with bindings, keys (shown once on rotation), sessions, attempts with review, the "Authenticate a face" tester | [summary-11](summary-11-face-auth.md) |
| 12 | Compliance | Retention policies, the plan (dry run) and runs, legal holds, data subject requests (typed-confirmation erasure), processing activities, integrations (write-only secret), exports (owner-only files), system status, the audit log; the console-wide smoke | [summary-12](summary-12-compliance.md) |

The roadmap (`roadmap.md`) has every phase done. Every phase has a demo video in `playwright-output/`
(`phase-NN-<name>.webm`, git-ignored).

## Data-layer changes made during the UI work

Migrations (`apps/nhost/nhost/migrations/default/`). Metadata is generated with
`pnpm --filter nhost metadata:generate`; each change also has a line in `tasks/data-layer/summary.md`.

| Migration | Phase | What it does |
|---|---|---|
| `1792365700271_storage_sensitive_kind_guard` | 4 | Refuses sensitive file kinds (`profile_document`, `dsr_export`, `auth_capture`, `export`) from non-admin uploads. Closes bd `3v_mono-ryj` (`f3f3cc3`, `d9a515e`) |
| `1792365700272_face_source_cleanup` | 4 | Queues `face_source` originals with their crops, and adds an hourly sweep of unused originals (`de769d9`) |
| `1792365700273_occupancy_effective_identities` | 5 | Occupancy computed fields count distinct effective identities, matching `facility_occupancy_now` |
| `1792365700274_detection_person_fields` | 5 | Adds `detections.profile_id` / `person_erased`, computed for person filters and the "Erased subject" display |
| `1792365700275_event_rule_console_fields` | 5 | Adds `event_rule_versions.rule_type` and `incidents.rule_id` |
| `1792365700276_incident_console_fields` | 5 | Adds `incidents.assigned_to_me` (the "Mine" view) |
| `1792365700277_monitoring_console_fields` | 5 | Adds `watch_list_entries.active`, the handover "addressed to / sent by me" fields, and workspace support |
| `1792365700278_session_user_id_in_console_fields` | 5 | The "me" fields compare through `itap.session_user_id` (`c5f022f`) |
| `1792365700279_on_call_console_fields` | 6 | Adds `on_call_schedules.on_call_user_id` (who is on call now, as the escalation cron picks them) |
| `1792365700280_escalation_policy_clear_max_cycles` | 6 | A policy that does not repeat clears `max_cycles` |
| `1792365700281_delivery_console_fields` | 6 | Adds `notification_deliveries.to_me` and `origin` |
| `1792365700282_mark_all_notifications_read` | 6 | `mark_notifications_read(NULL)` marks all of the caller's notifications as read |
| `1792365700283_segment_member_opened_now` | 7 | Adds `segment_members.opened_now`, so the console can say which memberships an add opened |
| `1792365700284_profile_full_name` | 7 | Adds `profiles.full_name`, for pickers, relation cells, titles and search (`d30cd03`) |
| `1792365700285_dashboard_console_fields` | 8 | Adds `dashboards.owned_by_me` and `is_default`, with one default per owner (`3498092`) |
| `1792365700286_report_requested_by_me` | 8 | Adds `reports.requested_by_me` (the "Mine" view and the lost-answer check) (`0b2dacd`) |
| `1792365700287_integration_has_secret` | 12 | Adds `integrations.has_secret`; the secret stays write-only (`3af5eaf`) |

Backend (`apps/backend/`):
- `de769d9`: enrollment deletes face source uploads after use and with their crop (phase 4).
- `3a1dd4d`: a test that one default workspace per user is taken over, not refused (phase 5).
- `4d47ddb`: an inbox integration test case for "mark all read" (phase 6).
- `0ecab28`: seed users get display names, so "Org Admin" no longer shows as a uuid (phase 8).
- `4b622f2`: `rotate_client_key` passes `member_required` / `organization_required` on as their own
  codes (phase 11).
- `c264dd9`: `authenticate_face` queues the caller's tester frames for deletion (phase 11).

Docker:
- `11a137c`, `b491e26`, `71c54ab`: prod proxy routes for the console (GraphQL, auth, storage,
  streams), and the prod frontend waits for its upstreams.
- `4440ec1`: `patches/` is copied before `pnpm install` in image builds.
- Dev proxy: the `^/auth/` key replaces `/auth`, so app routes under `/auth…` survive a reload
  (`e28f2e2`, console only).

## Framework gaps (buro 0.6.0)

`buro-gaps.md` logs 89 gaps (G1–G89), each with the need, where it bit, the workaround and the
evidence.

| State | Count | Gaps |
|---|---|---|
| Fixed upstream, unreleased | 3 | G2, G3, G10 (thin local workarounds stay until a release) |
| Resolved in the console by a 0.6 pattern | 1 | G16 |
| Data layer works around it, framework wish stands | 1 | G29 (`profiles.full_name`) |
| Open, with a workaround in the console | 80 | everything else |

The gaps that cost the most:
- **G12**: `onUnknown.check` cannot see what the flow submitted. 18 flows accept the "unknown" screen;
  they are listed with reasons in `tests/check-app.test.ts`.
- **Server refusals that do not reach the form**: G14 / G48 / G50 (record forms), G54 (Delete), G78
  (related-list "+ Create"). The generic alert stays where client checks cannot mirror the database.
  The flows map their refusals through `withActionRefusals` and `sqlRefusals`.
- **Many-to-many writes**: G5 / G62 (read-only links). Junction resources and twin resources (G45) are
  used for every binding.
- **G72**: a confirm-only flow loses its toast in a real browser on some surfaces. The More menu and
  row-menu surfaces keep it (measured in phases 10–11).
- **G84**: an unsalted hash of a write-only secret stays in `sessionStorage` after a lost answer. This
  is the one security-relevant gap; it is accepted for the demo and pinned by a test.
- **Dates and scope**: G37 (date-time shown as a date: `itap.date-time` field), G27 (scope cannot
  narrow through a relation), G28 / G44 (saved views cannot hold "now" or "me": computed fields
  instead).

## Deferred items and known limits (across phases)

- **Refusal texts**: record forms show "Validation failed" for refusals the client checks cannot
  foresee (races, deleted references, inactive members). See G14, G48, G50, G54 and G78.
- **Facility scope**: device health and events (G27), face-auth sessions and attempts (no
  `facility_id`), and the governance lists are not narrowed by the sidebar facility.
- **Unknown screens**: lost answers of 18 flows have no Check again (G12). Each says where to look
  first.
- **Streams**: `/streams/` is unauthenticated (phase 3); a real deployment needs signed URLs.
- **Computed columns without indexes**: `detections.profile_id` / `person_erased` and
  `incidents.rule_id` scan (about 150 ms at 23k detections). That is fine for the demo.
- **Many-to-many and bulk**: merges are one identity page at a time (G34); there is no bulk "Add to
  segment" from lists; reordering of steps and rotations is by number (G51).
- **Dashboards**: the tiles lose buro's placement chrome (G60); heatmaps are capped at 31 days.
- **Search**: Run now does not run "as" the saved search (needs a backend argument); a stored
  multi-value filter loads with its first value (G64).
- **Access**: Publish has no facility field (G77); "Received" on an override is judged by time, not
  epoch.
- **Compliance**: listed in `summary-12-compliance.md` (hold notice and merges, overdue marker lag,
  G84).
- **Test residues** that stay by design:
  - profiles, visits and documents cannot be deleted (phase 4 smoke: inactive `e2e-` visitors);
  - fixed reusable test segments (phase 7);
  - approval and sync-log audit rows of the access dev tests (phase 10);
  - one pending `e2e-…@itap.test` invitation per foundation run (phase 0).

  Every other suite removes what it writes, using the admin secret for cleanup only.
- **Minors**: each phase summary has a "Deferred" section with the parked minors of its reviews.

## Test inventory

| Kind | Where | Count |
|---|---|---|
| Unit (vitest, node) | `tests/**/*.test.ts` without `.dev.` | 67 files |
| Page (vitest, jsdom, the real `ConsoleApp` over fake fetch) | `tests/**/*.test.tsx` | 68 files |
| Dev stack (vitest, `ITAP_DEV_STACK=1`, real Hasura, actions and jobs) | `tests/integration/*.dev.test.ts` | 45 files |
| Console suite total | | 180 files, 1 344 tests (final run with `ITAP_DEV_STACK=1`: 1 343 passed, 941 s; the one failure came from rows an earlier run left behind, and its file passed when rerun) |
| e2e (Playwright, Chromium, against the seeded dev stack) | `e2e/*.spec.ts` | 15 specs, 80 tests |
| Backend unit (vitest) | `apps/backend/src` | 81 files, 552 tests (all passed) |

`tests/check-app.test.ts` runs buro's `checkApp` over the whole app and its bundles. It reports no
diagnostics except 18 accepted `flow.unknown-unhandled` warnings (G12), each listed with its reason.
`tests/docs-integrity.test.ts` checks the documentation corpus:
- no orphan or empty docs;
- no summary that only restates its label;
- every article reachable, scoped to a registered resource and titled;
- glossary terms listed and written.

Coverage of the corpus:

| Item | Documented | Total |
|---|---|---|
| Resources with label, plural and `texts.doc.summary` | 137 | 137 |
| Fields with `texts.doc.summary` (the rest have labels that carry their meaning: ID, name, code…) | 1 033 | 1 354 |
| Actions and flows with a doc summary | 108 | |
| Articles (`src/modules/<module>/docs/<scope>/<topic>.en.md`) | 81 | |
| Custom pages | 16 | |
| Glossary terms | 2 | |

## How to run

```bash
make dev-compose && make hasura_apply && pnpm seed   # dev stack, migrations, demo data (seed takes several minutes; --reset re-creates it)
pnpm --filter admin-ui dev                           # console on http://127.0.0.1:5173 (sign in as admin@itap.demo with SEED_PASSWORD)
pnpm --filter admin-ui lint && pnpm --filter admin-ui typecheck && pnpm --filter admin-ui build
pnpm --filter admin-ui test                          # unit and page tests (always `vitest run`)
ITAP_DEV_STACK=1 SEED_PASSWORD=... GRAPHQL_ADMIN_SECRET=... pnpm --filter admin-ui test   # + dev-stack tests
ITAP_DEV_STACK=1 SEED_PASSWORD=... GRAPHQL_ADMIN_SECRET=... pnpm --filter admin-ui exec playwright test -c e2e/playwright.config.ts <spec>.spec.ts
pnpm --filter backend exec vitest run src            # backend unit tests
```

Notes:
- Export only `SEED_PASSWORD` and `GRAPHQL_ADMIN_SECRET` from `apps/backend/.env`; never source the
  whole file. The admin secret is used for test cleanup only.
- Run e2e specs one file at a time, never the whole suite. They share one signed-in admin state
  (`e2e/.auth/admin.json`, written by `global-setup.ts`).
- hasura-auth allows ten sign-ins per five minutes. Leave about five minutes between a dev-stack run
  and an e2e run.
- Some specs need insightface (people, search, face auth) and `GRAPHQL_ADMIN_SECRET` (cleanup).
- `console-smoke.spec.ts` opens every page of the navigation (89 pages, about 6 minutes).
- The seed's dev log prints the face-auth demo keys once when they are issued (`pnpm seed --reset`
  re-issues them).

## Open bd issues relevant to the console

`bd ready` at the close of phase 12:
- `3v_mono-ey1` (P3, bug): member relations show the user's uuid when `displayName` is empty. The
  seed now sets names (`0ecab28`); other users still lack them.
- `3v_mono-mln` (P3): the floor plan shape editor has no keyboard input.
- `3v_mono-62p` (P3): `apply_facility_template` should skip names that already exist.
- `3v_mono-e6n` (P3): the seed should place seeded devices on the floor plans.
- `3v_mono-5l8` (P3): refused storage uploads leave empty `storage.files` rows.
- `3v_mono-a9w` (P3): `enroll_face` links the identity before committing photos.
- `3v_mono-427` (P3): the event rule test/replay function is missing (design §6.9).
- `3v_mono-lsq` (P2): there is no profile duplicate detection job, and the seed creates no pairs (the
  Duplicates lists are empty).
- `3v_mono-qhp` (P3): the console suite needs a global 5 s async timeout under load.
- `3v_mono-e0b` (P3): about 85 leftover "Org A"/"Org B" test organizations on the dev stack.
- `3v_mono-8c1` (P3, bug, new): buro G84, the attempt hash of a lost "Set secret" request stays in `sessionStorage`; it needs a buro fix, after which the pinning test is removed.

Older epics still open (`3v_mono-faw`, `3v_mono-2m8`, `3v_mono-app`, `3v_mono-sup`) predate the new
console. The console covers what they describe; they are left for the owner to close.
