# ITAP Console Phase 12 — Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Governance screens: retention policies with a dry-run plan and run history, legal holds, data
subject requests end to end, records of processing with DPIA files, integrations with secrets and sync
runs, export definitions and jobs, system status, and the audit log. Then the final whole-console pass.

**Architecture:** A new `compliance` ConsoleModule. Server functions/actions behind flows: `retention_plan`
(dry run), `run_retention` is cron-only (UI shows runs), `reject_dsr` / `complete_dsr` / `retry_dsr`,
`set_processing_restriction` (from phase 4), `set_integration_secret`, `run_integration_sync`,
`run_export_definition`, `get_system_status`; files via `open_file` (dsr_export, export, dpia kinds).

**Spec:** `tasks/ui/design.md`; data model `tasks/data-layer/design.md` §6.14–§6.15, "Compliance (slice 10,
as built)" in §8.1, §8.3–§8.5; `tasks/data-layer/summary-10-compliance.md` (known limits).

## Global Constraints
- Earlier Global Constraints and `IMPLEMENTER-CONTEXT.md` apply.
- Retention: one active policy per (class, facility); facility-specific beats org-wide; class floors
  (audit/auth_attempts ≥ 365 days); allowed actions per class — mirror client-side, server is authority.
- Legal holds: start frozen once started; end only set/shortened; targets exactly-one; not deletable while
  active.
- DSR: due date default +30 d (max +90 d); job columns read-only; erasure is irreversible → confirm +
  review with what will be erased (retention_plan-style preview if available) and a typed confirmation.
- Integration secret via `set_integration_secret` (write-only; clear allowed); exports owner-only.
- Audit log is read-only, filterable by entity/action/user/time; changes diff view.

## Review Focus
1. Erasure cannot be started without a typed confirmation and shows partial outcome under a hold. — Task 2.
2. The retention plan (dry run) shows counts per class and changes nothing. — Task 1.
3. A legal hold's start cannot be moved once started (no input offered). — Task 1.
4. An export file is downloadable only by its owner; others see no link. — Task 3.
5. System status renders even when a probe fails (that probe shows down). — Task 4.

---
### Task 1: Retention and legal holds

Carry-over from phase 4: document that the `face_source` sweep (~1 h, migration 1792365700272) ignores legal holds (raw uploads are not records) and that retention/erasure `files_enqueued` counts include originals; fix the identity article wording "removes its original at once" → queued and drained within ~10 min.
Retention policies (class, facility, days, action, active) with class rules, retention plan block (dry
run), retention runs + per-class rows, legal holds + targets, hold banners on held profiles/identities/
incidents. Commit `feat(ui): retention and legal holds`.

### Task 2: Data subject requests and processing activities
DSR resource (code, profile, type, status, received/due/completed, outcome, partial, rejection), steps
timeline, create flows per type, reject/complete (rectification)/retry flows, export bundle download,
overdue saved view; processing activities (legal basis, data classes link, DPIA status + file, owner).
Commit `feat(ui): data subject requests and processing activities`.

### Task 3: Integrations and exports
Integrations (kind, provider, config with schedule, field mapping, direction, status, secret write-only,
last sync/error), sync runs log, "Run sync" flow; export definitions (entity, format, filters, mode,
max rows, schedule) + jobs (status, rows, file), "Run now". Commit `feat(ui): integrations and exports`.

### Task 4: System status and audit log
System status page (`get_system_status`: probes, cron lag, queue depths, DB size, last retention run;
refresh), audit log (entity/action/user/time filters, diff view of `changes`, links to entities).
Commit `feat(ui): system status and audit log`.

### Task 5: Phase close and console-wide pass
e2e `compliance.spec.ts`; a console-wide smoke over every module's list page; checkApp/docs-integrity
coverage report; gates; demo `phase-12-compliance.webm`; `summary-12-compliance.md`; final
`tasks/ui/summary.md` (all phases, gaps, deferred items, how to run); roadmap; push.
