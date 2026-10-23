# Summary — phase 9: Search & bulk

Plan: `plan-09-search-bulk.md`. Data model `tasks/data-layer/design.md` §6.11 (search) and the bulk job
lifecycle (slice 7). Framework gaps: `buro-gaps.md` (G63–G71). Branch `feat/ui-console`, base `19d0523`:
face and attribute search `21d89cb`, saved searches `10f5513` + review follow-ups `bae134d`, bulk jobs
`64ed7f9` + review follow-ups `964fc25`, the search smoke suite and this summary.
Demo video: `playwright-output/phase-09-search.webm` (a face search with a seeded employee's photo found
first and exact, its history page, the history list, a new attribute saved search run with "Run now", a
1 500-row dry-run profile import followed live row by row to "Partly failed" with its two failed rows in
words, the All rows and Details tabs; git-ignored like the earlier videos; everything it wrote was
removed afterwards).

## What was built

All in `apps/admin-ui/`, in a new `search` ConsoleModule (`src/modules/search/`), nav section Search
(Search, Search history, Saved searches, Bulk jobs).

- **Search page** (`/search`): face or attribute search, the photo by upload or the phase-4 webcam
  capture (kind `search`, owner-only), attribute filters (status, profile link and type, company,
  gender, age, first/last seen, seen in a facility and when), threshold (0.2..0.95, starts at
  `1 − recognition_threshold`), results at most, fuzzy. The `itap:search-results` block answers in place:
  the searched photo and its outcome (no face, low quality, invalid image, several faces — the largest
  was searched —, nobody matched, an error), then one card per identity (photo, rank, match type Exact /
  Partial / Fuzzy per §6.11, similarity, identity and profile links or "Unknown person").
- **Search history** (`search_request`, owner-only, read-only): results block and "How it was run"
  (filters in words, `itap.search-filters`); **Run again** (face: threshold/limit/fuzzy prefilled, not
  offered once the photo is gone; attributes: limit only).
- **Saved searches** (`saved_search`): the search form plus name, shared, schedule (`itap.cron`),
  alert on new matches; "No alert baseline yet" notice; last scheduled run with its results and the
  scheduled runs list; **Run now** (an ordinary search with the stored definition); **Edit** sends the
  definition only when it changed and then warns, before saving, that the alert baseline resets
  (Review Focus 5); someone else's shared search is read-only (rules on `ctx.user.id`).
- **Bulk jobs** (`bulk_job`, read-only, `bulk_job_row`): **Import profiles** and **Update profiles**
  (CSV `bulk_input` upload, dry run, key column), **Bulk face search** (a photo picker that writes the
  job's CSV, G71); the job page with the destructive "The job failed" panel, the live
  `itap:bulk-job-progress` block (rows read of total, counts, a sum that adds up incl. "not reached",
  polls every 2 s for at most 30 minutes per run), the result file, Failed / Succeeded / All rows tabs
  (each row's error in words, `itap.bulk-error`), Details (input file for its owner, options in words).
  **Retry** only on failed / partly failed jobs with an input file; **Cancel job** on queued / running
  (Review Focus 3, 4).
- **Data layer:** no data-layer changes this phase (no migration, no metadata, no backend change).

## Reusable for later phases

- `pollWhile(pending, ms)` (`src/data/poll-while.ts`, G66): a query that polls until its own answer
  says the job is done (exports, DSRs, integration syncs in phase 12).
- The bulk progress block pattern (bounded polling restarted per run, a sum that adds up,
  `effects.refetch` of the page).
- `itap.bulk-error`-style code → sentence fields with a "Refused: <code>" fallback.
- `storageFile({ required })`, `bulkSearchCsv` / `parseBulkSearchCsv`, `search-sent.ts`
  (`rememberSent` / `searchRan`: "Check again" for actions without a correlation id).

## Rulings (from the ledger)

- Task 1 exports the search params shape and the results block; Tasks 2 and 3 reuse them (bulk search
  rows show the same results block).
- Task 1 review minors folded into Task 2; Task 2 minors 1, 2, 4, 5 folded into Task 3, 3 and 6 parked;
  Task 3 minors 1–6 fixed in `964fc25`, 7 consistent with the retry ruling.
- **Retry is not offered on cancelled jobs**: per the plan's Global Constraint ("retry only failed")
  the console offers Retry on failed and partly failed jobs, although `retry_bulk_job` also accepts a
  cancelled one; a cancelled job therefore cannot be resumed from the console.

## Task 3 review follow-ups (`964fc25`)

- The bulk search photo picker rebuilds its photo list from the chosen CSV when mounted again (page
  memory, else the CSV read back), so adding photos never drops earlier ones; an unreadable CSV offers
  Clear only.
- Sentences for the search codes `invalid_input` and `invalid_filters`.
- The result file kind per job kind (`bulk_result` / `bulk_search_result`, `bulkResultFileKind`).
- The progress block restarts its 30-minute window on a new run (status or attempts change) and re-reads
  the job when the page's status is ahead of it (after Retry).
- Retry "Check again" (`retryApplied`) reads applied when the job is pending/completed or its attempts
  grew, so a retried job ending partial or failed again is not mistaken for not applied.
- The bulk dev-stack test also deletes profiles by its own `devtest.bulk.%` address.

## Found by the smoke suite and the demo

- The seeded crop `person-01/1.jpg` (the VIP) finds an unknown camera identity first and only partial;
  the suite uses `person-03/1.jpg` (Thomas Kirby, exact, 100 %).
- A job cancelled while still queued never read its file, so it has no total and no sum; one cancelled
  while running shows "N not reached". The suite accepts both.
- The "The job is cancelled." toast was not seen by the e2e assertion (the jsdom page test sees it, and
  now asserts it); the suite checks the page state instead.
- Bulk job codes keep counting (BULK-000nn); cleanup does not reset the sequence.

## Framework gaps met

- G63 a resource-level flow inline on a page has no label (the Search page is a current-record screen
  of a `search_workspace` twin over organization settings).
- G64 no multi-value enum field (status and profile type are single-pick).
- G65 a flow form `when` cannot read the record (two "Run again" flows).
- G66 `refetchInterval` cannot be a function (`pollWhile`).
- G67 flow warnings show only on the last step (the baseline warning).
- G68 a layout body cannot be shared across field maps (one cast).
- G69 `runFlow` cannot script custom query sources.
- G70 a related list has no filters or column sets of its own (rows tabs per kind).
- G71 a form cannot produce a file from what was entered (the bulk search CSV is written by a field).

## Deferred and residues

- Retry on cancelled jobs (ruling above). Run now does not run "as" the saved search (no
  `saved_search_id` argument on `search_faces`; baseline and scheduled runs untouched): a backend change.
- Withdrawn consent is covered only generically (no seeded identity with matching disabled).
- A stored multi-value filter loads with its first value (G64); saved search "Check again" matches by
  name within 15 s; no "Mine" view on saved searches (no `owned_by_me`).
- Bulk search photos and CSVs of an abandoned form stay in the bucket (G71), as other uploads.
- The progress block polls the job row (`bulk_jobs_by_pk`); `bulk_job_progress` is backend-only.
- Retry's "Check again" from a list row menu reads "unknown" (the list row has no `attempts`).
- Parked minors: Task 2 review minors 3 and 6.
- Test residues: none. The smoke suite and the demo delete, with the admin secret (cleanup only), the
  search requests of the run (by id, and the admin's own hand-made requests since the run started),
  their photos, the bulk jobs (rows cascade) with their input and result files, and the saved search
  by name should a step fail before the console deleted it. Residual check after the runs: 0 requests,
  0 saved searches, 0 jobs, 0 files, 0 profiles. The search dev test leaves one `rolled_back` merge row
  per run (as the governance test does).

## Gates

With `ITAP_DEV_STACK=1` the full console suite ran once: 148 files, 1108 tests, all passed. The
jsdom assertion added afterwards for the cancel toast passed on its own (bulk-jobs page, 7 tests). e2e
`search.spec.ts` 6 passed. Lint, typecheck and build are clean.

## How to run

```bash
make dev-compose && make hasura_apply && pnpm seed  # dev stack, migrations and demo data
pnpm --filter admin-ui dev                         # console on http://127.0.0.1:5173
pnpm --filter admin-ui lint && pnpm --filter admin-ui typecheck
pnpm --filter admin-ui test                        # unit/jsdom
ITAP_DEV_STACK=1 SEED_PASSWORD=... GRAPHQL_ADMIN_SECRET=... pnpm --filter admin-ui test   # + dev-stack tests
ITAP_DEV_STACK=1 SEED_PASSWORD=... GRAPHQL_ADMIN_SECRET=... pnpm --filter admin-ui exec playwright test -c e2e/playwright.config.ts search.spec.ts
pnpm --filter admin-ui build
```

`search.spec.ts` needs insightface (its face steps skip without it) and `GRAPHQL_ADMIN_SECRET` for its
cleanup. Run specs by file, never the whole e2e suite. Sign-in is limited to ten per five minutes.
