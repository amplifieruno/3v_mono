# ITAP Console Phase 9 — Search and Bulk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Face and attribute search (upload or webcam capture), results with match types, owner-only
history, saved searches with schedules and alerts, and bulk jobs (profile import/update, bulk search)
with row outcomes, retry and cancel.

**Architecture:** A new `search` ConsoleModule. `search_faces` is a Hasura action wrapped as
`defineMutation` behind a resource-less search page (form + results block); history/saved searches are
owner-only resources; bulk jobs upload an input file (`bulk_input` kind, owner-only) through the
`storageFile` field (or `f.file` after the buro release) and are processed by the backend event trigger;
the UI polls job progress (`bulk_job_progress`).

**Spec:** `tasks/ui/design.md` §10 call 2; data model `tasks/data-layer/design.md` §6.11, §8.3–§8.5.

## Global Constraints
- Earlier Global Constraints and `IMPLEMENTER-CONTEXT.md` apply.
- Search history and results are owner-only (`search_requests.user_id`); never offer other users' runs.
- Match types and thresholds per §6.11 (exact ≥ threshold + 0.15, partial ≥ threshold, fuzzy when
  requested); threshold 0.2..0.95, default `1 − recognition_threshold` (read from organization settings).
- Bulk job definitions are frozen once queued; retry only failed (`retry_bulk_job`), cancel via
  `cancel_bulk_job`; row results are read-only, owner-only for `bulk_search`.
- Webcam capture reuses the phase-4 `itap:webcam-capture` block.

## Review Focus
1. A photo with no face or several faces shows the action's per-photo outcome, not an empty result. — Task 1.
2. Results never include identities of restricted or consent-withdrawn people (server rule), and merged
   identities resolve to their target. — Task 1 dev-stack test.
3. A bulk import with invalid rows shows each failed row's error and the counts add up. — Task 3.
4. Cancelling a running bulk job stops progress and shows cancelled; retry is offered only when failed. — Task 3.
5. Editing a saved search's definition resets its baseline (server) and the UI says so. — Task 2.

---
### Task 1: Face and attribute search
Search page (search type, image via upload or webcam, attribute filters, threshold, max results,
fuzzy), results block (identity cards with photo, confidence, match type, links), search history list
(owner), re-run from history. Commit `feat(ui): face and attribute search`.

### Task 2: Saved searches
Saved search resource (name, description, type, filters, image, threshold, max results, fuzzy, shared,
schedule cron with readable summary, alert on match; system run fields), "Run now", last run results
link. Commit `feat(ui): saved searches`.

### Task 3: Bulk jobs
Bulk job resource (code, kind, input file, options per kind, status, counts, errors, result file),
create flows per kind (profile import, profile update, bulk search) with input file upload, live progress
(polling `bulk_job_progress`), rows list with outcome filters, retry/cancel flows, result file download.
Commit `feat(ui): bulk jobs`.

### Task 4: Phase close
e2e `search.spec.ts`, gates, demo `phase-09-search.webm`, `summary-09-search.md`, gaps/roadmap, push.
