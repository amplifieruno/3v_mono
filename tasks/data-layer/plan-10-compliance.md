# Data Layer Slice 10 — Compliance, Retention, DSR, Integrations, Exports, Prod Cutover Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Governance of everything slices 1–9 store: retention policies executed daily with legal holds, data subject requests (access/portability bundles, erasure, rectification, restriction), records of processing with DPIA, integrations (HR fixture sync for real, SIEM/BMS stubs) with sync runs, export definitions and jobs, a system status action — and a prod cutover runbook (documentation only; nothing is deployed).

**Architecture:** Builds on slices 1–9 (summaries; `.claude/rules/hasura-conventions.md`). Retention is a registry of data classes, each mapped to a SQL purge function (delete or anonymize, batched, FK-ordered, legal-hold aware, guard bypass through one transaction-local context flag), driven by a daily cron and a dry-run planner. DSR and exports are event-triggered backend jobs with the lease/attempt fencing pattern from slice 7. The slice 7/8/9 summaries' "slice 10 purge lists" are requirements.

**Tech Stack:** Postgres 16, Hasura v2.46, Express/TypeScript, storage API, in-house CSV/JSON/XLSX/zip writers (slice 7), vitest.

**Spec:** `tasks/data-layer/design.md` — §6.14, §6.15, §8.1 (`consent_withdrawn` retention window), §8.3 (`retention_cleanup`, `run_export_definitions`), §8.4 (`run_sync`, `run_export`, `fulfil_dsr`), §8.5 (`run_integration_sync`, `get_system_status`), §9, §10 (prod stack); purge lists in `summary-07-analytics.md`, `summary-08-physical-access.md`, `summary-09-face-auth.md`; SA_4 (`docs/stages/SA_4_EN.md`).

## Global Constraints

- All conventions apply. Never deploy, never touch prod, never rotate secrets — the cutover is a runbook.
- Data classes (enum `retention_data_classes`, extends the spec list): detections, locations, sessions, events, deliveries, webhook_deliveries, incidents (closed), photos (identity photos of archived unknowns), embeddings_withdrawn (consent), unknown_identities, auth_attempts, auth_evidence, search_history, bulk_jobs, reports, access_decisions, terminal_syncs, stats, audit, trigger_logs (existing purge cron stays). Each class: one SQL function `itap.purge_<class>(org, cutoff, limit) → (affected int)` deleting or anonymizing per the policy action; files deleted via the storage API by the backend from a returned list (or a `pending_file_deletions` queue table drained by the cron — choose one consistent mechanism).
- Legal holds: a hold on identity / profile / incident / facility covers every row referencing it (directly or through the identity↔profile link) for its active period; purge functions skip covered rows (`itap.legal_hold_covers(...)` helpers, indexed).
- Precedence: facility-specific policy over org-wide; the most restrictive (shortest) applies only within its scope; no policy = keep (document defaults seeded).
- Append-only guards (decisions, attempts, overrides, audit, membership history) are bypassed only inside `itap.retention_context` (transaction-local), never via metadata.
- DSR: due_at = received + 30 days; access/portability bundle = JSON per entity + files (photos, documents) zipped (reuse the slice-7 zip writer) into the org bucket kind `dsr_export` (sensitive); erasure = profile anonymized (name/contacts/custom fields), identities' biometrics deleted (embeddings, centroids, photos, evidence, search images), references in logs nulled per purge lists, audit rows kept with redacted payload; restriction = `processing_restricted` on the profile → excluded from recognition matching, auth population, search, segments; rectification = recorded request + normal audited update. Every DSR step audited.
- Integrations: secret **secret**; HR sync applies a fixture file (create/update/deactivate profiles keyed by `source_integration_id + external_id` — add the FK deferred since slice 2); SIEM/BMS runs are stubs with plausible counts; failure → `integration_failed` event.
- Exports: run as the requesting member's role through Hasura (permissions apply); incremental mode by watermark column; files in the org bucket kind `export`.

## Review Focus

1. A retention run never deletes rows covered by an active legal hold, and resumes correctly after a crash mid-batch.
2. Erasure leaves no biometric data or direct identifier for the person anywhere (tables, files, events/payloads, search/auth records) while audit integrity is preserved.
3. Restriction stops all automated processing for the person (recognition, auth, search, segments) without deleting data.
4. An export never contains rows the requesting member cannot read.
5. Purge order never violates FKs or guards (decisions before grants/policy versions; profile deletion blocked by grants handled).

---

### Task 1: Compliance schema
`retention_policies`, `legal_holds` + `legal_hold_targets`, `data_subject_requests` (+ `dsr_steps` log), `processing_activities` (+ junction to data classes; DPIA file kind `dpia`), `profiles.processing_restricted` (+ effects wired into match_face, auth population, search, segment evaluation, Stage A identity matching), `retention_runs` / `retention_run_classes` (ro), `pending_file_deletions` (if chosen), FK `profiles.source_integration_id` (after Task 4's integrations table — or create `integrations` here). Permissions, guards, tests (Review Focus 3).

### Task 2: Retention engine
Registry + purge functions per class (from the slice 7–9 purge lists and spec §6.14), legal-hold coverage helpers, planner `itap.retention_plan(hasura_session, at)` (dry-run counts), cron `retention_cleanup` (daily; batches; resumable; run log), file deletion drain, consent-withdrawn embedding deletion after the window. Tests: Review Focus 1, 5; each class; dry-run purity.

### Task 3: DSR
Event trigger `fulfil_dsr` (lease fencing), access/portability bundle, erasure, restriction, rectification flow, SLA tracking (`due_at`, overdue → event), audit. Tests: Review Focus 2 (scan every table/file for the subject after erasure), 3.

### Task 4: Integrations, exports, system status
`integrations` (+ secret), `integration_sync_runs`, action `run_integration_sync`, event trigger `run_sync` (HR fixture real; SIEM/BMS stubs), `export_definitions` / `export_jobs`, event trigger `run_export` + cron `run_export_definitions` (watermark), action `get_system_status` (Hasura, Postgres, InsightFace, storage, stream-server, cron lag, queue depths, DB sizes). Tests: Review Focus 4; HR sync create/update/deactivate idempotent.

### Task 5: Seed
Retention policies (defaults per class; one facility-specific), a legal hold on an incident and a profile, processing activities with a DPIA file, DSRs (access completed with bundle, erasure completed, restriction active, rectification pending, one overdue), integrations (HR with fixture + sync history, SIEM ok, BMS failing with integration_failed events), export definitions + jobs with files, retention run history (dry-run style past runs that deleted nothing older than the seed window — the seed keeps 30 days of demo data intact: policies ≥ 31 days except classes demonstrably purged in a test fixture). Seed test invariants.

### Task 6: Prod cutover runbook + final docs
`tasks/data-layer/prod-cutover.md` (runbook only: prerequisites, secrets to rotate incl. the leaked ones and AUTH_KEY_ENCRYPTION_KEY, compose changes (ports, insightface cpus, webhook flags), DB/storage recreation steps, migrations/metadata apply, seed on server, cron/event webhook URLs, verification checklist, rollback); `summary-10-compliance.md`; final `tasks/data-layer/summary.md` (all slices, owner actions, known limits); design/roadmap/CLAUDE.md/conventions; gates; push.
