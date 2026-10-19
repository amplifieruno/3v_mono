# Data Layer Slice 7 — Analytics, Reports, Search, Bulk, Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real aggregated analytics (hourly area stats, daily facility stats, area transitions, activity stats) from tracking data, query functions the dashboards and reports read, `abnormal_movement` detection, reports (types, templates, schedules, metrics, rendered files, delivery), face/attribute search with history and saved searches, bulk jobs with partial commit, dashboards — with 30 days of seeded history produced by the same aggregation code.

**Architecture:** Builds on slices 1–6 (summaries; `.claude/rules/hasura-conventions.md`). Aggregation is SQL (`itap.aggregate_stats(org, at)`), idempotent per hour bucket, driven by an hourly cron and by the seed for past hours. Reads for UI are tracked query functions over stats tables (never over raw detections for long ranges). Side effects (rendering files, running bulk jobs) are event triggers → backend, idempotent, with status state machines on the rows. Search reuses `match_face`.

**Tech Stack:** Postgres 16 (pgvector), Hasura v2.46 actions/event/cron triggers, Express/TypeScript, InsightFace-REST, storage API (org buckets), vitest. CSV/JSON rendered for real; PDF/XLSX: simple real files (no heavy deps; e.g. a minimal PDF writer in ≤150 lines or an existing dependency already in the tree — check before adding any).

**Spec:** `tasks/data-layer/design.md` — §6.10, §6.11, §8.1 (query functions: `facility_occupancy_now`, `identity_timeline`, `occupancy_series`, `flow_matrix`, `dashboard_kpis`), §8.2 (`abnormal_movement`), §8.3 (`aggregate_stats`, `run_report_schedules`, `run_saved_searches`), §8.4 (`render_report`, `run_bulk_job`), §8.5 (`search_faces`, `generate_incident_report`), §9.

## Global Constraints

- All conventions so far apply. Stats tables (`area_hourly_stats`, `facility_daily_stats`, `area_transitions_daily`, activity stats) are **ro**, tenant_read, not audited, unique per bucket, written only by SQL aggregation (upsert = idempotent re-aggregation of a bucket).
- Time buckets: hourly buckets in UTC hours; daily buckets are facility-local days (facility timezone). `facility_daily_stats.peak_hour` is the local hour.
- `aggregate_stats(org, at)` (admin-only): (re)aggregates the last complete hour before `at` (and the facility-local day(s) containing it), the transitions of those day(s), then `run_activity_stats` (slice 6). Seed calls it for every past hour in ascending order.
- Reports: `reports` code `REPORT`; status state machine queued → generating → completed | failed; `expired` by retention later; `notification_deliveries.report_id` FK added (composite, SET NULL (report_id)) + per-origin unique index (slice 5 left the column); report files in the org bucket kind `report`.
- Search: `search_requests` per user (owner-only select, like the inbox) — `search_faces` action writes request + results rows; `saved_searches` owner-managed with `is_shared` (shared ones readable by the org); `saved_search_match` events emitted by `run_saved_searches` via `emit_event` (check the event type exists; add if not).
- Bulk jobs: input file in org bucket; row-level results; `partial` when some rows fail; result CSV file with per-row outcome; idempotent restarts (processed counter as resume point).
- Dashboards: `dashboards` owner + `is_shared`; widgets jsonb validated by a CHECK function (known widget kinds and their query function names).
- No raw-detection scans in UI query functions for ranges > 1 day — use stats tables; `facility_occupancy_now` reads `area_occupancy`.

## Review Focus

1. Re-running aggregation for the same hour (cron retry, seed rerun) yields identical stats (no double counting).
2. A session spanning hour/day boundaries counts its dwell into the right buckets and unique identities once per bucket.
3. A report generation that fails midway leaves a `failed` report with `error`, no orphan file, and a retry (re-insert/requeue) works.
4. A bulk import with some invalid rows commits the valid ones, records per-row errors, and ends `partial`.
5. Search results and saved-search histories are not visible to other org members (owner-only), shared saved searches are.

---

### Task 1: Stats tables + aggregation + query functions + abnormal_movement + identity_timeline
Tables `area_hourly_stats` (area_id, facility_id, hour, unique_identities, entries, exits, avg_dwell_seconds, peak_occupancy), `facility_daily_stats` (spec columns), `area_transitions_daily` (facility_id, day, from_area_id, to_area_id, count); `itap.aggregate_stats(org, at)` (from `identity_locations` entries/exits, `tracking_sessions`, visits; dwell split across buckets); cron `aggregate_stats` hourly (scheduled_time; tolerance 3600 s) calling it per org; `run_activity_stats` stays in `evaluate_segments` (don't run it twice — decide: aggregate_stats does NOT call it; document). Query functions (tracked, org_admin, STABLE, result tables in `itap_results`): `facility_occupancy_now(facility)`, `occupancy_series(facility, from, to, bucket hour|day)`, `flow_matrix(facility, from, to)`, `identity_timeline(identity, from, to)` (union of the identity and its completed-merge sources; detections/locations/events/visits/access decisions later), `dashboard_kpis()` (today's unique visitors, current occupancy, open incidents by severity, devices offline, deliveries failed 24h, segment top movers). `abnormal_movement` in Stage B: a transition from→to whose 30-day count in `area_transitions_daily` is below a threshold (org setting, default ≤1 in 30 days) and both areas have ≥ N transitions in total (avoid cold start noise) → event (dedup `session:<id>:abnormal_movement:<to_area>`); replace the no-op function from slice 4. Tests: Review Focus 1, 2; functions; abnormal_movement.

### Task 2: Reports
Enums `report_types`, `report_formats`, `report_statuses`; tables `reports` (spec §6.10; code REPORT), `report_facilities`, `report_segments`, `report_templates` (is_system ro), `report_schedules` (cron validated, timezone, recipient_group_id, channel, is_active, last_run_at ro, next_run_at ro), `report_metrics` (ro); FK `notification_deliveries.report_id` + unique; event trigger `render_report` (insert reports with status queued → backend: generating → compute metrics per type from stats/query functions → render file (csv/json real, pdf/xlsx simple) → upload → completed with summary + report_metrics; schedule reports → deliveries to recipient group via the slice 5 delivery path (origin report)); cron `run_report_schedules` (15 min; due schedules → reports; next_run_at computed from cron + timezone — use an existing cron parser dependency if present, else a small parser for the 5-field subset documented); action `generate_incident_report(incident_id, format)` → reports row type incident; requeue function `retry_report(report)` for failed. Tests: Review Focus 3; each type renders; schedule → deliveries.

### Task 3: Search
Tables `search_requests` (owner-only), `search_results` (ro, rows), `saved_searches` (owner-managed; is_shared readable by org), action `search_faces(image_file_id | image upload ref, filters, threshold, max_results, search_type)` → InsightFace embedding → `match_face`-style top-N (all identities, not only best) + attribute filters → request + results rows with duration/top_confidence; attribute-only search (no image) via filters; cron `run_saved_searches` (hourly; saved searches with schedule_cron due and alert_on_match → run → `saved_search_match` events for new matches since last_run_at). Tests: Review Focus 5; ranking; filters.

### Task 4: Bulk jobs
Table `bulk_jobs` (spec §6.11; kind profile_import/profile_update/bulk_search; ro progress columns), `bulk_job_rows`? — decide: per-row errors in `errors` jsonb capped (first 500) + full outcome in the result CSV file; event trigger `run_bulk_job` (CSV parse (existing dep or small parser), validate each row with the same rules as profile insert (via Hasura as the job owner with org token → permissions + validations apply), commit per row (partial commit), progress updates every N rows, resume from `processed` on retry, result file); `bulk_search` = list of image files → search per row. Tests: Review Focus 4; resume; permissions (job runs as owner).

### Task 5: Dashboards + seed
`dashboards` (owner_id member FK, is_shared, layout/widgets validated); seed: 30 days of stats by calling `aggregate_stats` for every past hour in ascending order after the replay (measure time; keep the seed ≲ +60 s — batch per day if needed with an equivalent `aggregate_stats_range(org, from, to)`), report templates (system), schedules (weekly occupancy → Facility managers email; daily incidents digest), past reports with real files (rendered by the same renderer, back-dated), search history for the admin user, saved searches (one shared, one with alert), bulk jobs (one completed import, one partial with errors file), dashboards (Security overview shared, Facility manager personal). Seed test invariants.

### Task 6: Docs, summary, gates
`summary-07-analytics.md`, design.md updates, roadmap, CLAUDE.md, conventions (stats buckets, report state machine, bulk job resume), rulings export; gates; push.
