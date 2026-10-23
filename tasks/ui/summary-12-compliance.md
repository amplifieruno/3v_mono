# Summary — phase 12: Compliance

Plan: `plan-12-compliance.md`. Data model `tasks/data-layer/design.md` (§6.14–§6.15, "Compliance (slice 10,
as built)" in §8.1, §8.3–§8.5); `tasks/data-layer/summary-10-compliance.md` (known limits).
Framework gaps: `buro-gaps.md` (G81–G85; G14, G35, G54, G61, G72, G73, G75, G78 reused). Branch
`feat/ui-console`, base `7e50de0`: retention and legal holds `8e28f35` + review follow-ups `4228d38`,
data subject requests and processing activities `4025799` + review follow-ups `b121d3c`, integration
`has_secret` (data layer) `3af5eaf`, integrations and exports `646b10c` + review follow-ups `32a36b0`,
system status and audit log `31bf6cf` + review follow-ups `58f6d5f`, then the compliance and console smoke
suites and this summary. This is the last phase; the whole-console overview is `summary.md`.
Demo video: `playwright-output/phase-12-compliance.webm`. It shows:
- the retention policies and the retention plan (dry run), now and "In 30 days";
- a legal hold created in the console on a throwaway visitor, its People tab, the edit form with the
  start frozen ("its start can no longer move") and the hold notice on the person's page;
- an access request for a seeded employee followed to "Completed" with its bundle ("Open file");
- an erasure of the throwaway visitor: the review (what is erased, the hold that keeps the person),
  a wrong typed code refused, the right code, the confirmation, and the request completing partially;
- integrations (the HR fixture), sync runs, export definitions and jobs;
- system status (services, database, queued work, background jobs) and the audit log with an entry's diff.

The video is git-ignored like the earlier ones; everything it wrote was removed afterwards (the
throwaway person, the hold, both requests; the bundle file was queued for deletion).

## What was built

All in `apps/admin-ui/`, in a new `compliance` ConsoleModule (`src/modules/compliance/`), nav section
Compliance (Retention policies, Retention plan, Retention runs, Legal holds, Data subject requests,
Processing activities, Integrations, Integration sync runs, Export definitions, Export jobs, Audit log,
System status).

- **Retention policies** (`retention_policy`): class (21 data classes, purge order), facility (only for
  facility classes), days, action, active.
  - The class rules of `itap.retention_class_has_facility`, `retention_action_allowed` and
    `retention_min_days` are mirrored as form checks (floor 365 days for audit and auth attempts).
  - An async check refuses a second active policy of the same scope.
  - Activate / Deactivate (confirm, refusals mapped) and a Delete flow (G54 pattern).
- **Retention plan** (`/retention-plan`, block `itap:retention-plan` over the query `retention_plan(p_at)`,
  G73): "As of" now / +7 / +30 days, Count again, totals; per class and scope the cutoff, what would be
  purged and what holds keep. It is a dry run that writes nothing (Review Focus 2), asserted on the dev
  stack and in the browser.
- **Retention runs** and their classes are read-only logs; the run page lists its classes. The runs
  article documents the file deletion queue, the `face_source` sweep that ignores holds, and what the
  `files_enqueued` counts include (phase-4 carry-over).
- **Legal holds** (`legal_hold`):
  - The start of a started hold is never offered as an input: a field rule `deny edit` shows its
    reason instead (Review Focus 3).
  - The end can only be set or shortened, and an ended hold is frozen.
  - "End now" is in the More menu; holds are never deleted.
  - Targets are four twin resources (people, identities, incidents, facilities; G45). A target's
    Delete is disabled while its hold is in force (G75).
  - The block `itap:legal-hold-notice` heads held profiles, identities and incidents. It follows
    direct links, sibling identities and the people an incident names.
- **Data subject requests** (`data_subject_request`):
  - Job columns are read-only and only the notes are editable. Saved views: Open, Overdue (the
    platform's own marker), Erasures, Partial.
  - One create flow per type: access, portability, rectification (with the requested changes),
    restriction, erasure. Each applies the due-date rules: +30 days by default, at most +90.
  - **Erasure** (Review Focus 1):
    - The review block `itap:dsr-erasure-review` shows who is erased, their identities, and what is
      deleted or redacted.
    - It lists each hold in force on the person, on an incident naming them, or on a facility holding
      their rows. It fails closed when the holds cannot be read.
    - The person's code must be typed as confirmation (G81).
    - Then come the review step and a destructive confirm; `retry: 'never'`.
  - Reject, Complete (rectification) and Retry flows.
  - The steps timeline `itap:dsr-steps` polls while the job works (G61). A partial erasure gets a
    notice that links the holds.
  - The bundle opens through the audited `open_file`. The profile page has a Requests tab.
- **Processing activities** (`processing_activity`): legal basis, retention policy, owner, DPIA status
  and file (`dpia` kind), data classes as a junction list.
- **Integrations** (`integration`):
  - Fields: kind, provider, direction, status, settings, field mapping and `has_secret` (migration
    `1792365700287`).
  - Settings and mapping are JSON, with validators mirroring the CHECKs; `itap.integration-config`
    shows them as sentences.
  - Set secret: a password field sent to `set_integration_secret` only; the form never stores it.
  - Clear secret, and Run sync (refusals mapped; it opens the run).
  - Schedule: cron and time zone merged into `config` with `_append` / `_delete_key` (G83).
  - The sync runs log shows counts and problems.
- **Exports**:
  - Definitions: entity, format, filters, mode, rows per file, schedule, owner. Run now is offered to
    the owner only.
  - Jobs are read-only, and job pages poll while queued or running (`itap:job-watch`).
  - The job's file is the sensitive `export` kind, opened through `open_file`. A field rule denies it
    to anyone but the member who ran the export (Review Focus 4).
- **System status** (`/system-status`, `get_system_status`) shows:
  - the overall level;
  - services with response time and error;
  - database size and largest tables;
  - queued work and the last retention run;
  - background jobs with lag and errors.

  A failing probe shows Down with its error, and the rest renders (Review Focus 5).
- **Audit log** (`audit_entry` over `audit_log`):
  - Read-only, with cursor paging, filters by entity, action, user, time and record, and saved views.
  - The diff block `itap:audit-diff` shows each field before and after, and opens nested JSON.
    Inserts and deletes show the whole row. Purged and anonymized entries are explained in words.
    Secrets show as Redacted at any depth.
  - The record column links to the record's page when the table has one.
- **Docs**: articles for retention policies (index, plan), runs, legal holds, data subject requests,
  processing activities, integrations, export definitions, the audit log and system status.

## Data layer and backend

One migration: `1792365700287_integration_has_secret` (`integrations.has_secret`; the secret itself stays
unselectable). No backend change in this phase.

## Rulings (from the ledger)

- The erasure review's hold lookup extends Task 1's lookup to mirror `dsr_erase`'s selection,
  including incident and facility holds. The preview does not follow completed merges, and its text
  says so.
- The fix rounds were precise and tested on the dev stack, so no separate re-reviews were run.
- Task 3 minors were folded into Task 4 (schedule through `_append` / `_delete_key`, HR test robustness).
- G84 is accepted for the demo: the attempt hash of the Set secret request stays after a lost answer.
  It is logged and pinned by a test, and needs a buro fix.

## Found by the smoke suites and the demo

- The erasure dialog works end to end in Chromium: typed confirmation, review step, destructive
  confirm. This closes Task 2 concern 2 (`runFlow` could not drive the submit, G82). Under the hold the
  request completes partially within seconds.
- The export file rule holds in the browser: the second administrator sees "Only the member who ran
  the export can open its file" and no Open file button.
- The console-wide smoke opened all 89 navigation pages with no error state, no uncaught page error
  and no GraphQL error answer.

## Framework gaps met

- G81 a flow's confirmation cannot ask for typed text (erasure: a form field with an error check).
- G82 `runFlow`'s scripted reads ignore a handle whose `ref` is a name.
- G83 a field cannot stand for one key of a jsonb column (integration schedule).
- G84 a lost answer keeps an unsalted SHA-256 of the request body, secret included, in `sessionStorage`.
- G85 a block prop cannot be named `action`.

## Known limits

- When the client checks are bypassed, record-form refusals of policies, holds, activities and data
  classes show the generic alert (G14/G78). The flows map their own refusals.
- The hold notice follows direct links and the people an incident names, not completed merges. The
  engine does follow merges, and the plan and runs count what it keeps.
- "Overdue" follows the platform's overdue marker, up to ~10 min after the deadline.
- Retry's success path needs five real job failures. It is covered by `runFlow` and by its refusal on
  the dev stack.
- Export job lists show no file column (the owner rule reads the row); the file is on the job page.
- The audit "By" filter lists current members only; entries by removed members show the raw id.
- G84 is pinned, not fixed (see Rulings).
- Governance lists (retention policies, run classes, held facilities) are organization-wide and not
  narrowed by the sidebar facility.

## Gates

- **Console suite**: ran once with `ITAP_DEV_STACK=1`: 180 files, 1341 tests, all passed (931 s).
- **Backend unit tests**: 81 files, 552 tests, all passed.
- **e2e `compliance.spec.ts`**: 5 passed in about 1 minute. Cleanup left 0 rows; the counts are back
  at the seed's: 2 holds, 5 requests, 3 export definitions, 7 jobs, no throwaway person.
- **e2e `console-smoke.spec.ts`**: 1 passed over 89 pages in about 6 minutes.
- **Static checks**: lint, typecheck and build are clean.

## How to run

```bash
ITAP_DEV_STACK=1 SEED_PASSWORD=... GRAPHQL_ADMIN_SECRET=... pnpm --filter admin-ui exec playwright test -c e2e/playwright.config.ts compliance.spec.ts
ITAP_DEV_STACK=1 SEED_PASSWORD=... pnpm --filter admin-ui exec playwright test -c e2e/playwright.config.ts console-smoke.spec.ts
```

`compliance.spec.ts` needs `GRAPHQL_ADMIN_SECRET` for its cleanup. It signs the second administrator
in once and otherwise uses the shared admin state. It erases only a throwaway visitor it creates. Run
specs by file, never the whole e2e suite.
