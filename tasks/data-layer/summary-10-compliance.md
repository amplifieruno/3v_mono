# Slice 10 summary: Compliance (retention, legal holds, DSR, restriction, integrations, exports, system status)

**Where:**
- Branch `feat/data-layer-foundation`, commits `7c6f22d..HEAD`:
  - Task 1 `e69d188`..`01771c0`
  - Task 2 `a7beefe`..`0a19e9f`
  - Task 3 `b976f1e`..`4957188`
  - Task 4 `a187f8c`..`49df6c0`
  - Task 5 `69ad4ee`
  - Task 6: docs
- Spec: `design.md` §6.14, §6.15, §8.1, §8.3-8.5, §9, §10 (updated to as built).
- Plan: `plan-10-compliance.md`; rulings: `rulings-10-compliance.md`.
- Migrations 212-265.
- Prod cutover runbook: `prod-cutover.md`.
- No new backend dependencies: the zip, CSV and XLSX writers from slice 7 are reused.

## What was built

### Task 1: compliance schema and processing restriction (migrations 212-234)

**Enums:** retention data classes / actions / run statuses, DSR types and statuses, DPIA statuses, legal bases (GDPR Art. 6), integration kinds / statuses / directions, export formats / modes / job statuses.

**Tables:**
- `retention_policies`: class, optional facility, `retain_days` 1..36500, action, one active policy per (org, class, facility). The CHECK helpers `itap.retention_class_has_facility`, `retention_action_allowed` and `retention_min_days` (365 for audit and auth_attempts) must list every class.
- `legal_holds` + `legal_hold_targets`: exactly one of identity / profile / incident / facility.
- `data_subject_requests` (`DSR-xxxxx`, `due_at` = received + 30 days, at most + 90) + `dsr_steps`.
- `processing_activities` (`PA-xxxxx`, legal basis, retention policy, DPIA status / file of kind `dpia`, owner) + `processing_activity_data_classes`.
- `retention_runs` / `retention_run_classes`.
- `pending_file_deletions`.
- `integrations` (`INT-xxxxx`, encrypted secret).
- FK `profiles (organization_id, source_integration_id)`, SET NULL; `(organization_id, source_integration_id, external_id)` is unique.
- Generic trigger `itap.check_file_kind('<col>', '<kind>')`.

**Restriction of processing:**
- Columns: `profiles.processing_restricted` (+ `restricted_at` / `_by`, `restriction_reason`).
- It changes only through `itap.apply_processing_restriction` (context flag `itap.restriction_context`, audit `restrict` / `unrestrict`) and the org_admin wrapper `set_processing_restriction`.
- Restricted people are excluded from `match_face`, `auth_population_eval`, `search_candidates`, `sync_segment_members` plus the segment translator, and `refresh_activity_stats`.
- Guards (code `profile_processing_restricted` / `subject_restricted`): `profiles_restriction_guard`, `identities_restricted_link`, `identity_biometrics_insert_guard`, `segment_members_restricted` and `detections_restricted`.
- Restricting closes the person's open manual segment memberships and tracking sessions.
- `itap.match_face_suppressed(hasura_session, embedding, threshold)`: recognition drops a face when a restricted or consent-withdrawn identity is at least as similar as the best match (no detection, no new identity; `faces_suppressed` in `recognition_status`). Enrollment refuses such faces with `subject_restricted`.

**Legal-hold coverage:**
- Built on `itap.legal_hold_subjects(org, identities[], profiles[])`, the fixed point of identity -> profile, profile -> identities and completed merges in both directions.
- Wrappers: `legal_hold_covers_identity | profile | incident | facility(org, id, at)`, `held_identity_ids`, `held_profile_ids`.
- Targets of an active hold cannot be deleted (`legal_hold_active`).
- The hold timeline is one-way (`legal_holds_timeline`): once started, `starts_at` is frozen; `ends_at` may only be set or shortened; an ended hold is frozen.

**Integration secret:** stored only AES-256-GCM encrypted (`v2:`, AAD = integration id, key `AUTH_KEY_ENCRYPTION_KEY`). It is written only by the action `set_integration_secret` and is never selectable.

### Task 2: retention engine (migrations 235-245)

**Guard bypass:** one transaction-local bypass, `itap.retention_context`, set only by `retention_begin()` / `retention_end(prev)` inside the purge functions. Every guard a purge touches recognises it:
- the new generic `itap.guard_append_only` on `events`, `access_decisions`, `audit_log`;
- the authentication-attempt guard, used grants, emergency overrides and segment membership history.

A retention grant delete does not bump the policy epoch.

**Purge function contract:**
- One function per class: `itap.purge_<class>(org, cutoff, facility, subject_profile, subject_identity, limit, action) -> (affected, skipped_by_hold, files_enqueued)`. It is admin-only, does one batch, and `affected = 0` means the class is drained. `itap.purge_class` dispatches.
- Rows come from `itap.retention_candidates_<class>(itap.retention_scope)`, the single definition of a class, which the planner uses too.
- The scope (`itap.retention_scope(...)`) snapshots the legal holds once per call and applies facility precedence (an org-wide call skips facilities with their own policy), or a subject (the person graph, for DSR erasure).
- Anonymized rows carry a marker so they stop being candidates.
- Under the retention context, the audit trigger writes only action / entity / id with `{"retention": true}`.
- Anonymize rewrites `dedup_key` to `anonymized:<id>` and drops detection links.

**Files:**
- `itap.file_in_use` covers every file column; an introspection test enforces this.
- `itap.enqueue_unused_files` queues only files that no column references any more.
- The backend drains the queue through the storage API with `itap.claim_file_deletions(limit)`: leased, SKIP LOCKED, and drops rows whose file is in use again; 404 counts as done; backoff 2^n minutes up to 6 h; 10 attempts.

**Runner:** `itap.run_retention(org, at, batch = 500, budget_ms = 20000)`.
- One run per (org, scheduled time), under a per-org advisory lock with a 5-minute lease.
- Stale runs of other times are closed as `interrupted`.
- Targets come from `itap.retention_targets(org, at)` in `itap.retention_class_order`, facility-specific first.
- Each batch runs in a subtransaction, with its counts committed together with the rows. A failing class records its error and the run ends `failed`.

**Planner:** `itap.retention_plan(hasura_session, at)`, an org_admin query that is STABLE and writes nothing.

**Crons:** `retention_cleanup` daily at 03:30 UTC (tolerance 3600 s), then the drain; `drain_file_deletions` every 10 minutes, 500 per run.

**Consent window:** `organization_settings.consent_embedding_retention_days` (default 30) applies to `embeddings_withdrawn` when no policy exists.

**Seed support:** `itap.seed_complete_report` (seed-only clock `itap.seed_report_at`) keeps seeded report events append-only.

### Task 3: data subject requests (migrations 246-254)

**Event trigger `fulfil_dsr`** (insert, and `attempts_at_retry` for a requeue) -> backend `src/dsr` with lease / attempt fencing:
- `claim_dsr`: 10-minute lease; a missing profile -> rejected `subject_not_found`; 5 attempts, then `max_attempts` until `retry_dsr`.
- `fail_dsr`: backoff 2^n minutes, max 60.
- `itap.dsr_fenced` guards every job writer.
- Cron `dsr_maintenance` (every 10 minutes): `due_dsrs` reclaims requests, then `dsr_overdue_events(at)` emits one `dsr_overdue` event per overdue request.

**By request type:**
- **Access / portability:** `itap.dsr_subject_bundle` (per entity, latest N rows, `truncated` / `notes`, other people's ids stripped, no deliveries / inbox) -> zip with `bundle.json` and the files (kind `dsr_export`, sensitive) -> `complete_dsr_export` (audit `export`).
- **Restriction:** `dsr_restrict`.
- **Rectification:** `dsr_await_rectification`. The org_admin edits the record, then closes it with `complete_dsr` (audit `rectify`). `reject_dsr` closes with audit `reject`.
- **Erasure:** `dsr_erase_restrict` is its own committed, fenced step. `dsr_erase` then runs in one transaction:
  1. `dsr_erase_prepare`: saved searches and reports whose dataset names the person.
  2. Every class through `purge_class` (holds honoured).
  3. The leftovers the classes keep by design (incidents unlinked and redacted, events anonymized, visits, consents, documents, grants, memberships, digests, other DSRs' text).
  4. Biometrics; identities that no retained row references are deleted.
  5. The tombstone profile (`erased_at`, `Erased subject`, inactive, restricted; `profiles_erased_guard` freezes it).
  6. Audit redaction, and finished Hasura `event_log` rows naming the person.
  7. Files are queued, then drained by the backend.
  - Under an active legal hold the erasure is **partial**: `partial = true`, plus a `retained` step listing the categories and hold ids.
- **Matching:**
  - Identifiers (`itap.dsr_ids`) are matched only structurally: column equality, or JSON leaf equality (`itap.dsr_json_hit`). UUIDs and codes match anywhere; employee / external id, email and phone match only under identifying keys.
  - Substrings (`itap.dsr_terms`) are matched only in free-text columns and keys. They cover the full name both ways and the email, at least 5 characters; the phone never matches as a substring.

**Carry from Task 2:** face-auth attempts are held at access points of held facilities and through events of held incidents (`itap.retention_attempt_row_held`).

### Task 4: integrations, exports, system status (migrations 255-265)

**Integration sync runs:**
- `integration_sync_runs`: read-only log with counts and at most 50 `{row, code}` errors, one running run per integration.
- Action `run_integration_sync` -> `itap.request_integration_sync`.
- Event trigger `run_sync`, payload columns `id, organization_id, integration_id, trigger` only.
- Lease functions `claim_ / complete_ / fail_integration_sync` and `renew_integration_sync_lease`.
- Cron `run_integration_schedules` (15 min) for `config.schedule_cron`.

**HR sync:**
- Applies a fixture file (kind `integration_fixture`; JSON or CSV) through the field mapping. It creates, updates changed columns and deactivates absent people, keyed by (source_integration_id, external_id); repeating the same fixture writes nothing.
- Writes go through an org-scoped admin session with `x-hasura-audit-reason: integration:<code>`. The `audit_row_change` trigger stores that as `reason`, for admin-secret sessions only.
- It skips restricted profiles (`skipped_restricted`) and erased people (`skipped_suppressed`). Erased people are recognised through `integration_suppressions`: the sha256 of `<integration id>:<external id>`, `itap.integration_suppression_key`, written by `dsr_erase`.

**SIEM / webhook / BMS stubs:** they count the events or occupancy rows. `config.simulate_error` makes any kind fail. A failure sets the integration to `error`, sets `last_error`, and emits one `integration_failed` event with ids and codes only.

**Exports:**
- `export_definitions` (`EXP-xxxxx`, entity allowlist `export_entities`, filters as a Hasura `where`, full / incremental, keyset cursor `(watermark, watermark_id)`, `max_rows` 1..50 000, schedule, owner-only).
- `export_jobs` (definition snapshot, requester = the active owner, one open job per definition, `subject_ids`).
- Event trigger `run_export`; cron `run_export_definitions` (15 min).
- The job queries Hasura with a **signed org token of the requester**, so permissions and readable columns apply.
- Files are kind `export`, owner-only and sensitive (audited open).
- `complete_export_job` moves the cursor only when the definition still starts at the job's cursor. It records `subject_ids` through `itap.export_subject_ids`, which the `export_jobs` retention class and DSR erasure use.
- `itap.member_active` also requires an enabled auth user and an active organization.

**Retention classes:** `export_jobs` (with files; org-wide runs sweep orphan export files) and `integration_sync_runs`, both delete-only.

**Status:** action `get_system_status` (org_admin):
- live probes of Hasura, Postgres, InsightFace, storage and the stream-server;
- `itap.system_status(org, at)`: connections, database size, 10 largest tables, cron lag from `hdb_catalog.hdb_cron_events`, the caller organization's queue depths and its last retention run;
- `scopes` marks which sections are platform-wide and which are organization-scoped.

### Task 5: seed (no SQL)

Step `compliance` (Nova Tower only, about 14 s; `apps/backend/src/seed/compliance*.ts`):
- **Policies:** 21 organization-wide policies plus one facility policy (detections, 45 days). The minimum is 31 days, so the 30-day demo history is never purged.
- **Legal holds:** 2 active holds (the resolved critical blacklist incident; the terminated contractor's profile).
- **Processing activities:** 5, two of them with an approved DPIA PDF.
- **Retention history:** 7 past runs through the real `run_retention`, each with 0 affected rows.
- **Integrations:**
  - Workday HR: CSV fixtures, 3 runs with created / updated / deactivated people.
  - Splunk SIEM: 3 runs; the demo secret is stored encrypted, and only when `AUTH_KEY_ENCRYPTION_KEY` is set.
  - BMS: 1 success, then 2 failures with `integration_failed` events.
- **Exports:** 3 definitions and 4 jobs with files. One incremental definition continues from its keyset cursor.
- **DSRs**, through the real `fulfilDsr`:
  - access, completed with a bundle;
  - restriction of a dedicated person;
  - erasure of a dedicated person, complete and not partial;
  - rectification, pending;
  - rectification, overdue, with its `dsr_overdue` event.

Seed test invariants are in `expectSeededCompliance`, including that the planner shows 0 candidates right after the seed. `pnpm seed --reset` takes about 355 s.

## Purge order

**Retention runner:** `itap.retention_class_order`, with facility-specific targets before org-wide ones:

`access_decisions` (then freed grants / overrides) -> `auth_evidence` -> `auth_attempts` -> `deliveries` -> `webhook_deliveries` -> `reports` -> `incidents` -> `events` -> `detections` -> `locations` -> `sessions` -> `search_history` -> `bulk_jobs` -> `export_jobs` -> `integration_sync_runs` -> `terminal_syncs` -> `stats` -> `photos` -> `embeddings_withdrawn` -> `unknown_identities` -> `audit`

The rules behind this order:
- Logs go before what they reference: decisions before grants and overrides, override areas before overrides.
- Reports go before incidents.
- Biometrics and identities come last; audit comes after everything.

**DSR erasure:**
1. `dsr_erase_restrict` (committed on its own).
2. `dsr_erase_prepare`: saved searches, reports naming the person.
3. The classes, in this order: `access_decisions`, `auth_evidence`, `auth_attempts`, `deliveries`, `webhook_deliveries`, `events`, `detections`, `locations`, `sessions`, `search_history`, `bulk_jobs` (archive), `export_jobs`.
4. Leftovers.
5. Biometrics and unreferenced identities.
6. The tombstone (+ integration suppression keys).
7. Audit and `event_log` redaction.
8. Files queued, then drained by the backend.

**Lock order of the restriction:** identity tracking advisory locks -> profile row -> identities KEY SHARE -> segments -> member rows -> sessions.

## Rulings (summary; full list in `rulings-10-compliance.md`)

**Schema and restriction:**
- `integrations` was created in Task 1, so the FK lands with the schema.
- Purge functions take a subject filter.
- One file-deletion queue drained by the backend.
- Restricted and consent-withdrawn faces are not processed at all (`match_face_suppressed`), with SQL backstops on biometrics, detections and segment members.
- Hold targets of an active hold cannot be deleted; the hold timeline is one-way.
- `trigger_logs` is not an organization class: the platform cron `purge_trigger_logs` stays.

**Retention:**
- One retention context for all guards.
- The planner is a dry run.
- Holds are evaluated at purge time (`now()`).
- Audit rows written under retention carry no values.

**DSR:**
- Erasure under a hold is partial (GDPR Art. 17(3)(e)).
- Erasure keeps a tombstone profile and deletes identities rather than unlinking them.
- Rectification is applied manually and closed with `complete_dsr`.
- Matching is structural; low-entropy identifiers are matched only under identifying keys.

**Integrations and exports:**
- The HR sync writes with an audit reason; exports run as the requester (org token).
- Export files are owner-only and sensitive.
- Exports use a keyset cursor.
- Erased HR people are suppressed by hash; restricted people are skipped.
- The `export` audit action predates migration 258, which therefore does not delete it.

**Seed:**
- Policies keep at least 31 days.
- DSRs go through the real flow, with dedicated subjects.
- Accepted deviations: BMS failure and DSR step times are not back-dated, and the retention history consists of real 0-row runs.

## Deviations from spec

- **§6.14:**
  - 21 retention classes instead of 8. `trigger_logs` is not a class.
  - `processing_activities.data_categories` became the junction `processing_activity_data_classes` (data classes).
  - DSRs have extra columns: `partial`, `details`, `outcome`, `rejection_reason`, the lease columns, `overdue_notified_at`, `requested_by`.
  - New tables: `retention_runs` / `retention_run_classes`, `pending_file_deletions`, `dsr_steps`.
  - `profiles` gained restriction and erasure columns.
- **§6.15:**
  - `integration_sync_runs` has counters, a trigger (manual / schedule), a lease and a fixture file.
  - `integrations.next_sync_at`.
  - New table `integration_suppressions`.
  - `export_definitions` has owner, timezone, the keyset `watermark_id`, `max_rows` and next / last run.
  - `export_jobs` has trigger, filters snapshot, cursor range, `truncated`, `subject_ids`, lease and error.
- **§8.3:** new crons `drain_file_deletions`, `dsr_maintenance`, `run_integration_schedules`.
- **§8.4:** `fulfil_dsr` also fires on `attempts_at_retry` updates (requeue). `run_sync` and `run_export` carry explicit payload column lists.
- **§8.5:** new action `set_integration_secret`.
- **`audit_row_change`:** stores `x-hasura-audit-reason` for admin-secret sessions.
- **Unused setting:** `organization_settings.default_retention_days` (slice 1) is not used by the engine: no policy means keep. The consent window has its own setting.

## Known limits (documented)

**Exports:**
- A row committed after an export run but with an earlier insertion time than the keyset cursor (a long transaction) is never exported. A lag window would duplicate rows under the keyset ruling. `updated_at` changes are not exported incrementally.
- `export_jobs.subject_ids` tracks `audit_log` rows only through their entity: rows about a profile or identity. Audit rows of other entities that mention a person only inside `changes` are not matched; erasure already strips them in the database.
- An export job that is queued or running when an erasure happens can still complete with a file that names the subject (narrow race; not re-scanned at completion).
- Export definitions are owner-only: other admins see definitions and jobs but cannot run them or open the files. Exports depend on GraphQL introspection being enabled for org_admin (`entity_not_readable` otherwise).

**DSR erasure:**
- Free text is redacted by exact terms only: ids, the full name both ways, email, phone (not as a substring), employee / external id. A lone first or last name in operator free text stays.
- The member's own user account (`auth.users`, memberships, their own deliveries) is out of DSR scope.
- Erasure is one transaction (about 5 s for the test person, including org-wide audit and `event_log` scans). Very large histories may need batching.
- Report naming is decided by recomputing the dataset at erasure time, so a report whose period data was already purged is not detected.
- Undelivered Hasura trigger payloads, and free text without an identifier in trigger payloads, stay until `purge_trigger_logs` (3 days).
- Published policy versions keep the tombstone profile id.
- HR fixture files are not modified on erasure. The suppression key is a plain sha256, so it is pseudonymous for low-entropy external ids.

**Retention:**
- Holds are evaluated at `now()`, not at the scheduled time.
- Kept by design until their parent goes:
  - incidents with a report, until the report is purged;
  - events linked to a non-held incident;
  - digests with a held source;
  - unknown identities that take part in merges, are incident subjects or are on watch lists.
- Audit rows of incident children are not covered by an incident hold.
- `retention_cleanup` processes every organization in one delivery (at most 12 calls of 20 s each); a larger backlog continues the next day.
- hasura-storage answers 500 for a storage row without an object. Exports treat that as a missing file after one retry.

**Seed:**
- Times are not back-dated for the BMS failures (events are append-only, so they are dated "now") or for the DSR steps (`dsr_steps.at` is the clock time).
- The first SIEM run counts every event the seed created (about 15k).
- Recovering from a crash in the middle of the compliance step needs `--reset` (the step's count guard skips it otherwise).

**Other:**
- `get_system_status` platform sections (checks, postgres, crons) are visible to every org_admin.
- `AUTH_KEY_ENCRYPTION_KEY` now protects integration secrets as well as client keys. Rotating it invalidates both.
- Restriction: identities linked concurrently between the unlocked read and the profile lock get no advisory lock (tiny window). Sessions close at their last detection.
- Size guideline exceeded: `recognition/frame.ts` has 305 lines; migrations 237 / 239 (~400 lines), 238 (~350) and 250 (359) are each one logical change.

## Open for the slice final review (ledger carries)

- File drain: re-check that a file is in use right before the storage delete, in addition to the check at claim.
- Make the claim test scoped to its organization.
- Retention: no-op audit rows; orphan sweep stall (exclude in-use files from candidates).
- Storage 500: treat a file as missing only when the object is confirmed absent.
- Seed:
  - add a shared `waitFor` util;
  - the retention `not_backdated` assertion is sensitive to live cron history;
  - the slice-9 `lobby_after_hours` assertion is date-dependent; its floor was lowered to 2 by the controller, and the re-run was pending when this was written.

## Test results

- **Integration:** 164 files (1 skipped), 1056 passed, 12 skipped, 0 failed (Task 5 full run, 675 s).
- **Unit:** backend 532 passed (78 files); metadata generator 100 passed (9 files).
- **Gates:** `pnpm lint` (0 errors), `pnpm typecheck`, `pnpm build` pass.
- **Seed test** (`RUN_SEED_TEST=1`): 12 tests. The compliance test passes; see the carry above for the slice-9 assertion.
- **Review Focus coverage:**
  - legal holds through merges and linked profiles, plus crash resumption: `retention-runner`, `compliance-schema-fixes`;
  - an all-tables erasure scan, including cross-org isolation for low-entropy ids: `dsr-erasure`, `dsr-erasure-isolation`;
  - restriction effects: `compliance-restriction*`;
  - exports limited to rows and columns the requester can read: `exports`, `exports-fixes`;
  - FK and guard order: `retention-guards`, `retention-fixes`.

## Owner actions

- Set `AUTH_KEY_ENCRYPTION_KEY` in prod. Without it there is no face auth, no integration secrets and no seeded SIEM secret.
- Run the cutover per `prod-cutover.md`: rotate every secret, audit the prod database for backdoors, apply the compose changes, recreate, seed, verify.
- Decide on `RECOGNITION_ENABLED` for prod.
- Nothing is merged to `main`; production is untouched.

## How to run

```bash
make dev-compose && make hasura_apply
pnpm --filter nhost metadata:generate
pnpm seed                              # --reset re-creates the demo data (about 6 min)
pnpm --filter nhost test
pnpm --filter backend exec vitest run src      # never watch mode
pnpm --filter backend test:integration
RUN_SEED_TEST=1 pnpm --filter backend exec vitest run -c vitest.integration.config.ts tests/integration/seed.test.ts
```

**Live demo**, as the Nova org_admin:
- **Retention:** `retention_plan(args: {})` shows the policy targets with 0 candidates. `set_processing_restriction` on a profile removes it from matching and search.
- **DSRs:** insert a `data_subject_requests` row of type `access`. Within seconds `fulfil_dsr` completes it with a `dsr_export` zip. Open it with `open_file` (audited).
- **Integrations and exports:**
  - `run_integration_sync` on the Workday integration writes a new sync run;
  - `get_system_status` shows checks, cron lag and queues;
  - an `export_jobs` insert on an owned definition produces a file.
