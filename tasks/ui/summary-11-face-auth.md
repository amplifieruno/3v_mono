# Summary — phase 11: Face authentication

Plan: `plan-11-face-auth.md`. Data model `tasks/data-layer/design.md` (§6.16 and "Face authentication
engine (as built)" in §8.1, slice 9); integrator doc `tasks/data-layer/face-auth-api.md`.
Framework gaps: `buro-gaps.md` (G78–G80; G72 measured again). Branch `feat/ui-console`, base
`fdd6846`: client applications `2d3d6bf`, keys `7ae6d1f`, backend fix `4b622f2`, keys review
follow-ups `0485130`, sessions/review/tester `3d21b72`, tester review follow-ups `4cb3e30`, then the dev-proxy fix `e28f2e2`, the
face-auth smoke suite `b1f1a95` and this summary.
Demo video: `playwright-output/phase-11-face-auth.webm`. It shows:
- the client applications list and a new application created in the console;
- its Population tab after "Add facility", "Add segment" and "Allow mode" (More menu);
- "Rotate key" with the secret dialog (a throwaway key), the Keys tab after a reload with the prefix
  and no secret, and the key revoked from its row before the video ends;
- "Authenticate a face" with 3 seeded frames and the decision with its links;
- the review queue ("Waiting for review" on Authentication attempts), a pending partial match
  approved with a note, and the attempt's Review tab with the reviewer and the note.

The video is git-ignored like the earlier ones; everything it wrote was removed afterwards.

## What was built

All in `apps/admin-ui/`, in a new `face-auth` ConsoleModule (`src/modules/face-auth/`), nav section
Face authentication (Client applications, Authentication sessions, Authentication attempts,
Authenticate a face).

- **Client applications** (`client_application`): code, name, description, platform, status,
  thresholds, liveness, "Only people on shift", sandbox (`write: 'create'`, never changes).
  - Thresholds `0 ≤ minimum ≤ threshold ≤ maximum ≤ 1`: each field checks 0..1, three form checks
    restate the database CHECK on create and edit.
  - Tabs Settings / Population / Modes and attributes / Keys / Sessions / Attempts.
  - Bindings (segments, facilities, access points, modes, attributes): five junction resources read
    and removed in titled lists; added by "Add segment", "Add facility", "Add access point", "Allow
    mode", "Share attribute" (More menu) over custom inserts with `sqlRefusals` (G78).
  - Sandbox (Review Focus 5): no facility or access point panels; the segment list sits in an info
    panel "Sandbox population: segments"; "Add facility" and "Add access point" are hidden with the
    reason, and a forced call is refused (`sandbox_location_binding`, mapped).
  - **Suspend**, **Reactivate**, **Revoke** (terminal) as confirm flows from the More menu; a revoked
    application is not edited, bound or rotated (disabled with the reason). **Delete** is a flow that
    maps "has history" to "revoke instead".
- **Keys** (`client_application_key`, read only, no secret column): prefix, created, expires, last
  used, revoked.
  - **Rotate key** (`rotate_client_key`, optional future expiry, `retry: 'never'`) opens the block
    `itap:client-key-secret` once: prefix, secret with Copy, the warning, the expiry, the overlap
    hint. The secret lives only in the flow result (Review Focus 1); a reload shows the prefix only.
  - A third active key is refused with the server's sentence (`client_key_limit`, Review Focus 2).
  - **Revoke key** (`revoke_client_key`, confirm) from the key's row; not offered on a revoked key.
- **Authentication sessions** and **attempts** (append-only logs: cursor paging, manual count,
  `noAggregate`).
  - Attempts: outcome, failure reason, attack check, confidence against threshold used, population
    size, latency and stage timings, matched identity/profile, evidence frame
    (`storageFile({ kind: 'auth_capture', sensitive: true })`, opened through the audited
    `open_file`), review. Saved views: Waiting for review (the review queue), Failures, Partial
    matches, Attacks detected, Reviewed.
  - **Approve** / **Reject** on a pending partial match only, with a required note
    (`review_authentication_attempt`, refusals mapped). The session succeeds or fails and closes; the
    toast says the "Face sign-in" / "Face sign-in failed" event was raised (none for a sandbox).
    The attempt shows the reviewer and the note (Review Focus 3).
- **Authenticate a face** (`/authenticate-a-face`, the G63 page pattern): active application, mode,
  claimed identity (verification only), access point, optional threshold, 3 to 5 frames from the
  camera (phase 4 webcam block) or files. Fewer than 3 frames are refused before sending (Review
  Focus 4). `authenticate_face` answers into `itap:auth-decision`: authenticated, outcome,
  confidence, identity link, shared attributes (a photo is a short-lived link, or says why there is
  none), attack check, failure code/message/guidance, next step, links to the attempt and session.
  - Frames upload as owner-only `search` files (Task 3 review): only their uploader sees them, and
    the action accepts a caller's own search files as probes (checked on the dev stack).
  - For a sandbox application the claimed-identity select offers synthetic identities only
    (`itap.sandbox-identity`, G80); the server still answers anyone else as not authenticated.
- **Docs**: articles for client applications (index, integration summary of the API, API keys),
  sessions, attempts (incl. review) and the tester.
- **Dev proxy fix** (found by the smoke suite): the Vite proxy key `/auth` also caught the app routes
  `/authenticate-a-face`, `/authentication-sessions` and `/authentication-attempts`, so a reload or a
  deep link answered hasura-auth's "404 page not found". The key is now `^/auth/`. Production nginx
  already uses `location /auth/`.
- **Data layer:** no migration and no metadata change this phase (`git diff fdd6846..HEAD --
  apps/nhost packages` is empty). One backend change: `4b622f2` — `rotate_client_key` passes
  `member_required` / `organization_required` on as their own codes (`auth-service/keys.ts`, with
  `keys.test.ts`).

## Reusable for later phases

- `itap.sandbox-identity` shows the shape for a relation select narrowed by a column of another
  relation picked in the same form: a field implementation reading `ref('values', …)` in its meta,
  `useOne` on the picked row, extra `fixedFilters` on the kit's relation input (G80).
- The once-only secret block (`then.open` from a form flow, nothing stored) for any generated secret.
- `e2e/face-auth-support.ts`: `seedPendingPartial` (a pending partial match through the seed-only
  `itap.seed_auth_flow`, admin secret) and `removeFaceAuthRun` (a run's applications, bindings, keys,
  sessions, attempts, events with fan-out, audit rows, evidence and tester frames).

## Rulings (from the ledger)

- Bindings are added by item flows in the More menu, not by the related lists' "+ Create" (G78): the
  database refusals (sandbox guard, duplicates, vanished target) must read as sentences.
- The status flows stay confirm-only from the More menu, the launch path phase 10 measured as keeping
  its toast; confirmed in this phase's smoke suite (below).
- Inactive facilities and access points are treated as archived for the binding pickers (there is no
  archived state).
- Task 1 minors were folded into Task 2, Task 2 minors (and the fixture that GitHub push protection
  would block, squashed) into Task 3.
- Task 3 review I1 (tester frames uploaded as organization-readable `face_source`) and minors 2–5
  were folded into this task's first commit, before anything shipped.

## Found by the smoke suite and the demo

- G72 does not hit **Suspend**, **Reactivate**, **Revoke** (More menu) nor **Revoke key** (row menu of
  the Keys list): each showed its toast in Chromium, and the smoke suite asserts all four. Task 1
  concern 2 and Task 2 concern 1 are withdrawn; `buro-gaps.md` G72 notes it.
- Approve with its note (form-hosted) shows its toast; the Review tab shows the note, and the attempt
  reads `reviewed_by` = the admin.
- The `/auth` dev proxy prefix bug (above).
- A tester run on a normal application bound to Nova Tower, Employees and identification with 3
  frames of `seed-assets/faces/person-03` reads success.

## Framework gaps met

- G78 a related list's "+ Create" cannot say why the database refused it (binding flows).
- G79 the "may have been applied" screen has no per-flow text (lost rotation, lost tester answer;
  the secret dialog closes on Escape without acknowledgement).
- G80 a relation's candidates cannot follow a column of another picked relation (sandbox identities).
- G72 measured again (above); G63 reused for the tester page.

## Known limits

- Sessions and attempts have no `facility_id`: the logs are not narrowed by the sidebar facility.
- Tester frames are kept: owner-only `search` files are purged by retention only through
  `search_requests.image_file_id` (`itap.purge_search_history`), which tester frames are not, so they
  stay until deleted.
- A lost tester answer has no Check again (G79/G12): the article points to the sessions log; a resend
  would read as a replayed sequence.
- The photo attribute in the decision links the URL the backend presigns; its host is the storage URL
  the backend sees, which may not open from a browser on another host (not exercised in dev: the test
  applications share no photo).
- Create-form refusals on the resource write (duplicate name, thresholds past the checks) show the
  generic alert (G14).

## Gates

- **Console suite**: ran once with `ITAP_DEV_STACK=1`. 167 files, 1232 tests, all passed.
- **Backend unit tests**: 80 files, 543 tests, all passed.
- **e2e**: `face-auth.spec.ts` 6 passed (about 1.1 minutes), cleanup left 0 rows.
- **Static checks**: lint, typecheck and build are clean.

## How to run

```bash
make dev-compose && make hasura_apply && pnpm seed  # dev stack, migrations and demo data
pnpm --filter admin-ui dev                         # console on http://127.0.0.1:5173
pnpm --filter admin-ui lint && pnpm --filter admin-ui typecheck
pnpm --filter admin-ui test                        # unit/jsdom
ITAP_DEV_STACK=1 SEED_PASSWORD=... GRAPHQL_ADMIN_SECRET=... pnpm --filter admin-ui test   # + dev-stack tests
ITAP_DEV_STACK=1 SEED_PASSWORD=... GRAPHQL_ADMIN_SECRET=... pnpm --filter admin-ui exec playwright test -c e2e/playwright.config.ts face-auth.spec.ts
pnpm --filter admin-ui build
pnpm --filter backend exec vitest run src          # backend unit tests
```

`face-auth.spec.ts` needs `GRAPHQL_ADMIN_SECRET` for the pending partial match and its cleanup, and
insightface for the tester step. It uses the shared admin state (one sign-in at most). Run specs by
file, never the whole e2e suite. Sign-in is limited to ten per five minutes.
