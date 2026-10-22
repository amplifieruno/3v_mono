# Summary — phase 5: Monitoring

Plan: `plan-05-monitoring.md`. Spec: `design.md`. Framework gaps: `buro-gaps.md` (G38–G48).
Branch `feat/ui-console`, base `d168f5b`: realtime hub `ad2c300`, detections/tracking/occupancy
`49996a5` + review fixes `cb31888`, events and event rules `98565aa`, incidents `0c20a88`, watch lists,
handovers and workspace `4e411e9`, review follow-ups `625a634`, the monitoring smoke suite and this
summary. Demo video: `playwright-output/phase-05-monitoring.webm` (occupancy now, detections filtered by
an area, a session's path, an event rule, an incident from acknowledge to resolved with a note and its
timeline, the operator workspace with the live wall; git-ignored like the earlier videos).

## What was built

All in `apps/admin-ui/`, in a new `monitoring` ConsoleModule (`src/modules/monitoring/`), nav section
Monitoring (Operator workspace first, then Events, Incidents, Shift handovers, Occupancy now, Detections,
Tracking sessions, Locations, Who is where, Watch lists, Watch-list entries, Event rules).

- **Multiplexed detection hub** (`src/realtime/detection-hub.ts`, `shared-hub.ts`): one Socket.io
  connection per session joins every subscribed camera's room (`join-device`/`leave-device`), reconnects
  with a fresh token and rejoins, stops only the refused camera on `device_not_found`, and stops every
  subscriber after three `unauthorized` answers. The live camera panel has a **Reconnect** button for
  that case. The camera page, every live-wall tile and the operator workspace share the hub
  (`use-live-deps.ts`). Closes the phase 3 carry-over.
- **Detections, tracking, occupancy.** `detection` (face thumbnail, identity/person, camera, area,
  confidence, new-identity flag; pinned filters facility/area/camera/time; saved views),
  `tracking_session` with a **Path** tab over `identity_location`, `identity_location`, `area_occupancy`
  ("Who is where"), and the **Occupancy now** page (floor-plan block coloured by occupancy, per-area
  list, polling) that agrees with `facility_occupancy_now`. Identity and profile pages get Detections
  and Sessions tabs. An erased person shows "erased" in place of a name.
- **Events and event rules.** `event` (28 types, severity colours, polling every 15 s), event rule
  header + versions + scopes, per-type parameters editor (`itap.event-rule-parameters`: dwell minutes,
  watch-list kinds), **Edit draft** (`create_event_rule_draft`), **Publish** and **Roll back to this
  version** (`publish_event_rule_version`), version history, scope as two resources over one table
  (G42), incidents opened by the rule on the rule page.
- **Incidents.** Number, severity, status, disposition, place, assignee, escalation; flows Acknowledge
  (idempotent: a second click by a stale page answers the incident unchanged, one timeline entry),
  Start investigation, Escalate, Resolve (disposition + resolution), Close, Reopen, Generate incident
  report; notes with files, linked events and identities, activity timeline written by the server;
  frozen read-only twins once closed; "Mine" view (computed `assigned_to_me`).
- **Watch lists, handovers, workspace.** `watch_list` with People and Identities tabs, entries added
  through two create paths (profile or identity, G45) and from the person's page, "Active/Expired"
  views; `shift_handover` with incident links, **Add open incidents**, **Acknowledge** (recipient only,
  freezes it), "For me" / "Sent by me" views; **Operator workspace** page: live wall, open incidents,
  latest critical events and occupancy facts in the order of the operator's default workspace
  (`operator_workspaces.layout`, edited with the panel-list field `itap.workspace-panels`).
- **Refusal maps.** Every new function/action carries a `sqlRefusals` map (acknowledge, investigate,
  escalate, resolve, close, report, draft, publish, handover acknowledge, add open incidents) and is in
  the `ACTION_REFUSALS` key-list test; `dateTime()` is the default for every event/detection time.
- **`@burojs/react` patch** (`patches/@burojs__react@0.6.0.patch`, root `pnpm.patchedDependencies`):
  the infinite-list observer stayed empty under React StrictMode (G38), so cursor lists (detections,
  sessions, locations) showed nothing in dev. Patched instead of removing StrictMode app-wide.
- **Data layer, migrations `1792365700273`–`277`:** 273 occupancy counts effective identities (merged
  identities counted once); 274 computed `detections.profile_id` / `person_erased`; 275 computed
  `event_rule_versions.rule_type` and `incidents.rule_id`; 276 computed `incidents.assigned_to_me`;
  277 computed `watch_list_entries.active`, `shift_handovers.addressed_to_me` / `sent_by_me`,
  `add_open_incidents_to_handover`, and a trigger making one default workspace per user.

## Reusable for later phases

- The detection hub (`sharedDetectionHub`) for any live view; the `incidentApplied` / `fieldApplied`
  lost-answer checks; the twin-resource pattern (editable twin + frozen `*_history` twin, G42);
  computed Hasura columns instead of relative saved-view values (G44) and relation `where` (G40);
  `itap.event-rule-parameters` as the model of a per-type jsonb editor (G43); `itap.workspace-panels`;
  the slot query for ordering a page from data (G46).

## Rulings (from the ledger)

- The events list pages by offset, not cursor, because buro ignores polling on a cursor list (G41);
  polling matters more for operators than deep paging.
- Event rule parameters are a custom field keyed by the header's rule type (G43), not record types.
- A minimal `incident` resource arrived in Task 2 (events link to it) and was completed in Task 3.
- StrictMode stays on; the infinite list is patched (G38) instead.
- Operator workspace `is_default`: making a workspace the default clears the user's previous default
  (trigger `operator_workspaces_single_default`, migration 277) instead of refusing; the page reads the
  default, else the first, else every panel. Confirmed by the e2e (default workspace read and edited).
- The seeded workspaces store panels as `{ type }` objects; the console reads both forms
  (`workspace-panels-format.ts`) and writes the string form on save, keeping other keys.
- Detections order: the path shows newest first (G39); the lost-answer check of "Add open incidents"
  is applied when every open incident is linked (the flow sees no count from before the call).

## Found by the smoke suite and the final gates

- The seeded workspace layouts were unreadable to the console (the page showed no panel for the
  default workspace); fixed in `625a634` with a test.
- The people smoke's identity creation clicked "Create identity from photos" before the photo had
  finished uploading and sent nothing (60 s timeout); it now waits for the upload, with a longer test
  timeout for up to three face analyses.

## Final review fixes

- **C1** the admin-ui and backend images copy `patches/` before `pnpm install` (the root
  `pnpm.patchedDependencies` needs it; every image build failed with ENOENT).
- **I2** the workspace e2e no longer turns recognition on for a seeded camera (real faces made
  unknown identities in the dev database): it adds an inactive camera of its own on a stream id the
  stream server does not have and deletes it in the sweep.
- **I3** the workspace's Occupancy panel reads its figures again every 15 seconds and says when
  (block `itap:occupancy-updated`, sharing the facts block's query cache; G47).
- **M4** events and incidents without a facility stay listed when a facility is picked
  (`empty: 'shared'`). **M5** a moved or kept panel keeps its stored object and settings; the events
  panel lists the severities its workspace names (seeded: medium and above), else critical; the
  panel is now titled "Latest events". **M6** the detection hub keeps its socket 1 s after the last
  view (a page swapping its views). **M8** migration `1792365700278`: the "me" computed fields
  compare through `itap.session_user_id`. **M10** the live wall reads its camera list every 15 s.
- **D1** the dwell time is whole minutes, 1 or more (validator and input agree). **D2** the
  incident and handover functions' refusal maps carry `member_not_active`; resource writes cannot
  show it (G48). **D3** the "Add open incidents" lost-answer check no longer reads "applied" when no
  incident is being handled.

## Framework gaps met (G38–G48)

- G38 cursor lists stay empty under React StrictMode (patched).
- G39 a related list cannot order its own rows.
- G40 a related list's `where` cannot cross a relation (computed column).
- G41 a polled list cannot page by cursor.
- G42 a related list's "+ Create" cannot follow the parent record's state (twin resources).
- G43 record types cannot key per-type fields inside one jsonb column.
- G44 a saved view cannot filter by the signed-in user (computed column).
- G45 record types cannot discriminate on which of two columns is set.
- G46 a page cannot order its nodes from data (slot query).
- G47 the facts block cannot poll (a sibling block polls the same query).
- G48 a record form shows no server refusal text (`member_not_active` on an assignee or recipient
  reads "Validation failed").

## bd issues filed this phase

- `3v_mono-427` — event rule test/replay function missing (design §6.9 promises replay of a draft
  against history); the console has no Test button.
- `3v_mono-qhp` — the console test suite needs a global 5 s async timeout under load; find the root
  cause (workers/maxWorkers).

## Deferred minors (from the reviews)

- Leave-while-joining in the hub; segment scope comment in event rules; "nobody yet" fallback
  wording on acknowledgement.
- "Add open incidents" does not filter by facility.
- A note's files "+ Create" shows for non-authors and the database refuses the write.
- Event rule test/replay: no function (bd 427).

## Known limits

- **Computed columns scan.** `detections.profile_id` / `person_erased` (migration 274) are SQL
  functions over the identity and profile of each row: filtering a person's detections by them reads
  about 140–180 ms at 23k detections on the dev stack (no index on the computed path). The
  incidents' `rule_id` (migration 275) is a regex over `dedup_key`, also without an index. Fine for
  the demo; a real deployment would store the columns (trigger-maintained) and index them.
- **Camera identities from earlier test runs.** Before the I2 fix the workspace e2e (and earlier
  manual recognition runs) switched recognition on for seeded cameras; the dev database holds about
  70 `source = camera`, `unverified` identities created on 2026-10-22 (Loading Dock and Lobby
  cameras). They are referenced by their detections, tracking sessions and events, and some may come
  from the owner's own demo runs, so they were left in place (no safe criterion tells test runs
  apart). `lifecycle_jobs` archives unknown identities over time; `pnpm seed --reset` removes them.
  To list them: `select i.code, i.created_at from itap.identities i where i.source = 'camera' and
  i.profile_id is null and i.created_at >= '2026-10-22'`.
- **Erased person on a detection.** The dev seed has no erased person with detections (a full
  erasure deletes the identities; only an erasure under a legal hold keeps them), so the console's
  "erased" display is covered by the jsdom test and the SQL half by the backend integration test
  `detection-person-fields.test.ts` in a disposable organization; the dev-stack suite does not
  tombstone a seeded profile (irreversible).
- **Member refusals on record forms (G48).** Saving an incident with an assignee, or a handover
  with a recipient, who is no longer an active member shows "Validation failed" without the reason.
- **Leftovers of the smoke suite.** None intended. Setup creates an incident, a handover and a
  camera, and the sweep deletes them with `GRAPHQL_ADMIN_SECRET` (an `org_admin` cannot delete an
  incident or a handover); the event rule is put back by publishing its first version again and
  deleting the version the run made; the watch-list entry is removed through the UI (and by the
  sweep if a step failed); the workspace layout is restored. A run that dies before its sweep leaves
  an `e2e-<timestamp>` incident, handover or camera, or a draft version of the first unusual-dwell
  rule; clean them by hand.
- The workspace test's camera is `inactive` on a stream id the stream server lacks: the recognition
  manager and the health check skip it, so it detects nothing and writes no health rows.

## Gates

Unit/jsdom 588 passed (73 dev-stack skipped, 99 files); with `ITAP_DEV_STACK=1` 661 passed (99
files); e2e 41 passed (monitoring 7, people 6, places 7, and the earlier specs). Lint, typecheck and
build clean. The first full e2e runs of the day failed once on a detections list that reloads empty
for an instant after a filter change (the monitoring step now polls for it).

## How to run

```bash
make dev-compose && pnpm seed                      # dev stack and demo data (insightface for faces)
pnpm --filter admin-ui dev                         # console on http://127.0.0.1:5173
pnpm --filter admin-ui lint && pnpm --filter admin-ui typecheck
pnpm --filter admin-ui test                        # unit/jsdom
ITAP_DEV_STACK=1 SEED_PASSWORD=... GRAPHQL_ADMIN_SECRET=... pnpm --filter admin-ui test       # + dev-stack tests
ITAP_DEV_STACK=1 SEED_PASSWORD=... GRAPHQL_ADMIN_SECRET=... pnpm --filter admin-ui test:e2e   # + monitoring smoke
pnpm --filter admin-ui build
```

`SEED_PASSWORD` and `GRAPHQL_ADMIN_SECRET` are in `apps/backend/.env`. Sign-in is limited to ten per
five minutes: the e2e signs in once and reuses the saved state; leave about five minutes between a
dev-stack run and an e2e run.
