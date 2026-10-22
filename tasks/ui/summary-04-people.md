# Summary — phase 4: People

Plan: `plan-04-people.md`. Spec: `design.md`. Framework gaps: `buro-gaps.md` (G28–G37).
Branch `feat/ui-console`, commits `1b17d36..e64df67`: data-layer fix `f3f3cc3` + `d9a515e`, buro
alignment `99544e4`, profiles `7b3f249`, documents/consent/restriction/duplicates `edaab7d`,
identities and enrollment `e6a52e6`, merges/verification/timeline `5292854` + `e1ab611`, visits
`59c3e7d`, merge-review fix `5f8731e`, the people smoke suite `e64df67` and this summary. Demo
video: `playwright-output/phase-04-people.webm` (a visitor profile and its tabs, a document opened,
identity creation with a per-photo result, a merge and its rollback, a visit checked in and out;
git-ignored like the earlier videos).

## What was built

All in `apps/admin-ui/`, in a new `people` ConsoleModule (`src/modules/people/`), nav section People
(Profiles, Identities, Visits, Identity merges, Verification requests, duplicate queues).

- **Data-layer fix (Task 0, bd 3v_mono-ryj, closed).** A trigger on `storage.files` refuses a
  sensitive file kind set by `org_admin` uploads; backend uploads (admin secret) still work.
  `itap.sensitive_file_kinds()` lists `profile_document`, `dsr_export`, `auth_capture`, `export`.
- **Buro alignment (Task 0b).** G16 adopted: the `itap:current-record` frame (organization
  profile/settings/preferences). G17 (resource `validate`) and G19 (`setValues`) checked against the
  0.6.0 source and kept as they were, with the reasons in `buro-gaps.md`.
- **Profiles** (`profile*.ts`): full CRUD, record types by `profile_type` (employee, visitor,
  contractor, VIP), list with filters and saved views (Employees, Visitors today, Blacklisted,
  Pending face link); show with tabs Details, Identities, Documents, Consent, Visits, Activity;
  restricted / erased notices. No delete: the lifecycle is the status.
- **Documents, consent, restriction, duplicates** (`profile-document.ts`, `document-upload.ts`,
  `consent-record.ts`, `restriction.ts`, `profile-duplicate.ts`, `merge-profiles*.ts`): "Upload
  document" over the `upload_profile_document` action (PDF/PNG/JPEG/WebP up to 10 MB, sent as
  base64), documents open through the audited `open_file` on every click, consent with a Withdraw
  flow, Restrict / Lift processing, the profile duplicate queue with a side-by-side compare and
  "Merge profiles" (review, confirm).
- **Identities and enrollment** (`identity*.ts`, `enrollment*.ts`): list/show, "Create identity from
  photos", "Add photos", and "Enroll face" on a profile, each over the backend action with a
  per-photo result block (accepted, rejected with the reason); photo gallery, relationships block.
- **Governance** (`identity-merge*.ts`, `verification-*.ts`, `identity-duplicate*.ts`): "Merge into
  this identity" (picker, review of what moves, confirm), the identity merges list with "Roll back"
  (review of what comes back), "Split" with a photo chooser, the identity duplicate queue, verification
  requests with Approve / Reject, relationships added from the identity.
- **Identity timeline** (`src/blocks/identity-timeline/`): entries grouped by day over
  `identity_timeline`, with place and camera names, merged-in identities marked, "Show older".
- **Visits** (`visit*.ts`): list with saved views (Today, Expected now, No-shows), Check in / Check
  out / Cancel flows over the SQL functions, Edit only while scheduled, tabs on profiles and
  companies. Articles for every resource under `people/docs/`.

## Reusable for later phases

- **`itap.date-time` field** (`src/fields/date-time*.ts(x)`): a `datetime-local` input that sends an
  ISO instant, with a date-and-time display (G37). Use it wherever a time of day matters
  (event windows, report schedules); plain `f.dateTime` is date-only in 0.6.
- **Refusal mappers.** `src/data/sql-refusals.ts` reads a SQL function's `Check constraint violation.
  <code>` as a definite refusal, and `src/data/action-refusals.ts` (`withActionRefusals`) does the same
  for backend Actions, so a flow's form shows the server's sentence instead of "may have been
  applied" (G33). `hasuraOperation(..., refusals)` takes the per-operation code map; collected into
  `ACTION_REFUSALS`. Every later phase with actions (search, bulk, access, auth) should use them.
- **Face photos field + webcam** (`src/fields/face-photos*.ts(x)`, `src/blocks/webcam-capture/`):
  `facePhotos({ min, max })` uploads or captures 1..N photos and hands file ids to the form;
  the webcam is a component inside the field (a block cannot hand a file id to a form). Phase 9 face
  search and the phase 11 tester reuse it (`min:1, max:1`).
- **Inline file** (`itap.inline-file`): reads a picked file into base64 for actions that take the
  file in the request; sensitive, kept out of drafts.
- **Carried ids and split photos** (`carried-id.ts`, `split-photos*.ts`): hidden form values for a
  review step (G35) and a toggle-thumbnail photo chooser.
- **Identity timeline block** and **photo-gallery block**; the **review blocks** (`identity-merge-review`,
  `merge-rollback-review`) as a model for "what moves" reviews.
- **Current-record frame** (`itap:current-record`) for single-record pages.
- **Status-applied check** (`src/data/status-applied.ts`, `fieldApplied`) for flows' `onUnknown`.

## Rulings (from the ledger)

- Webcam is a field component, not a registered block (a block cannot give a form a file id).
- Merge is an item flow on the kept identity, not a bulk merge of the selection: 0.6 bulk flows take
  no form or review (G34). Cost: no multi-select merge.
- Visitor picker offers visitor profiles, host picker every non-visitor (the DB allows contractors
  and VIPs to host); profile `displayField` stays `last_name` (G29).
- Visit window shows a full date and time through the new date-time field; created/updated stamps
  elsewhere stay date-only.
- Verification: only a `pending_verification` identity goes back to unverified on reject.
- Face source photos use file kind `face_source` (no kind is prescribed by the data layer).

## Found by the smoke suite

- **The merge review step crashed.** The identity picker's candidates read `ref('record', …)`, which
  the review step (drawn over the flow's values) cannot resolve: the dialog showed "This section could
  not be loaded". Fixed in `5f8731e`: the kept identity and its synthetic flag travel as values
  (`target_id`, `target_synthetic`). The jsdom tests did not catch it. Related to G35.
- The cancel flow is one dialog with two steps (form, then confirm), not two dialogs.
- A multi-select picker stays open after a choice; Escape closes only the picker.

## Framework gaps met (G28–G37)

- G28 a saved view cannot hold a relative date (static load-day workaround).
- G29 a relation label is one field; a person's name is two.
- G30 a record type cannot be changed after create.
- G31 `runFlow` reads only resources passed as real handles.
- G32 an async check over the record does not decide a flow's button before the click.
- G33 an Action's definite refusal reads as "may have been applied" (provider wrapper).
- G34 a bulk flow takes no form or review.
- G35 a flow's review step reads the flow's values as its record (carried ids).
- G36 a related list cannot list rows matching either of two keys.
- G37 a date-time field is entered and shown as a date (`itap.date-time`).

## bd issues filed this phase

- `3v_mono-ryj` — sensitive file kinds from org_admin uploads (closed, Task 0).
- `3v_mono-5l8` — refused storage uploads leave empty not-uploaded `storage.files` rows.
- `3v_mono-lsq` — profile duplicate detection job missing; the seed creates no duplicate pairs
  (the duplicates queue is empty in the demo).
- `3v_mono-t45` — uploaded face source photos (`face_source`) are never deleted.
- `3v_mono-a9w` — `enroll_face` links the identity before committing photos; a guard error after
  linking leaves the link written.
- `3v_mono-ey1` — member relations show the user's uuid when the display name is empty.

## Deferred minors (from the reviews)

- design.md lists a duplicate "incl. export"; the current-record frame drops RecordActions in edit.
- Restriction reason of only whitespace gives the generic error; the 10 MB document is base64-copied
  twice in the browser; the restriction review step is untested.
- The `has_face` flag shows twice on the profile until the identities tab; hidden type fields hide
  their stored values (noted in the article); the email check cites G14 only in `email-check.ts`.
- `DateTimeDisplay` ignores `presentation: plain`; created/updated stay date-only (G37).
- Merge needs one identity page per kept identity (no multi-select merge, G34).

## Known limits

- **Leftovers of the smoke suite.** Profiles, visits and documents cannot be deleted, and neither can
  identities. The run's visitor is set inactive (its last name starts with `e2e-`), its visits are
  checked out or cancelled, its document stays, and a created identity is archived. Archived
  identities still match faces, so each run that creates an identity uses up one spare face
  (`apps/backend/tests/fixtures/faces/person-a-1.jpg`, `person-b.jpg`, two InsightFace-REST samples);
  when all are used the creation step is annotated and skipped (the known-face refusal is still
  asserted). The verification step approves a request on a seeded identity and puts its status back;
  the approved request stays. Dev-stack vitest `visits.dev.test.ts` needs no scheduled visit without
  a host: cancel any `e2e-` visit a failed run left scheduled.
- The e2e needs insightface up for the identity step (`INSIGHTFACE_URL`, default
  `http://127.0.0.1:18080`; skipped when it is down).
- Controller-written plans for phases 9-12 are committed with this summary:
  `plan-09-search-bulk.md`, `plan-10-access.md`, `plan-11-face-auth.md`, `plan-12-compliance.md`.

## Gates

Unit/jsdom 478 passed (59 dev-stack skipped, 83 files); with `ITAP_DEV_STACK=1` 537 passed (83
files); e2e 34 passed (auth 5, devices 6, foundation 5, organization 5, people 6, places 7). Lint,
typecheck and build clean.

## How to run

```bash
make dev-compose && pnpm seed                      # dev stack and demo data (insightface for faces)
pnpm --filter admin-ui dev                         # console on http://127.0.0.1:5173
pnpm --filter admin-ui lint && pnpm --filter admin-ui typecheck
pnpm --filter admin-ui test                        # unit/jsdom
ITAP_DEV_STACK=1 SEED_PASSWORD=... pnpm --filter admin-ui test       # + dev-stack tests
ITAP_DEV_STACK=1 SEED_PASSWORD=... pnpm --filter admin-ui test:e2e   # + people smoke
pnpm --filter admin-ui build
```

`SEED_PASSWORD` is in `apps/backend/.env`. Sign-in is limited to ten per five minutes
(`summary-02-places.md`): the e2e signs in once and reuses the saved state while its token has more
than ten minutes left; leave about five minutes between a dev-stack run and an e2e run.
