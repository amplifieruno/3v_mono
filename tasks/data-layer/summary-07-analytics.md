# Slice 7 summary: Analytics, reports, search, bulk jobs, dashboards

Branch `feat/data-layer-foundation`: commits `4858f02..HEAD` (`f82de68` .. `bffe776` plus the Task 6 docs/gates commit). Spec: `design.md` (§6.10, §6.11, §8.1-8.5); plan: `plan-07-analytics.md`. No new backend dependencies: cron parsing (5-field subset), CSV parse/write, PDF (single-font text/table writer) and XLSX (minimal OOXML zip over `node:zlib`) are in-house, each ~150 lines with unit tests.

## What was built

### Task 1: stats, query functions, abnormal_movement (migrations 109-119)
- **Tables** (all **ro**, not audited, FKs to facilities/areas `ON DELETE CASCADE`, see rulings): `area_hourly_stats` (facility_id, nullable area_id = facility total row, UTC `hour`, unique_identities, entries, exits, `dwell_seconds`, avg_dwell_seconds, peak_occupancy; key `NULLS NOT DISTINCT`), `facility_daily_stats` (facility-local `day`, unique/known/unknown identities, visits, `guest_visits`, avg_visit_minutes, `dwell_seconds`, peak_occupancy, peak_hour), `area_transitions_daily` (facility, day, from/to area, count > 0).
- **Presence model** (`itap.stats_presence`): facility scope = the tracking session; area scope = runs of consecutive `identity_locations` in one area. Merged identities count once (merge group = effective identity). Hourly rows exist only for hours with activity; direct area plus a facility-total row, no parent-area roll-up. Daily rows always cover the whole local day with the data present (run order never matters; DST days handled). Transitions are counted on the local day the second run starts.
- **Writers** (admin-only): `aggregate_stats_range(org, from, to)` (set-based, upserts only changed rows, deletes rows of buckets that lost their data, per-org advisory lock) and `aggregate_stats(org, at)` = the trailing window `[hour_floor(at - tracking_timeout - 180 s) - 1 h, hour_floor(at))`, so late session closes and a missed run heal on the next run. Neither calls `run_activity_stats` (`evaluate_segments` does). Cron `aggregate_stats` hourly at :05 (`5 * * * *`, tolerance 3600 s), per organization.
- **Query functions** (org_admin, STABLE, session-scoped, results in `itap_results.*`): `facility_occupancy_now` (effective identities per subtree, direct and total), `occupancy_series(facility, from, to, bucket)` (hour/day, zero-filled, capped 2000 h / 731 d), `flow_matrix`, `dashboard_kpis` (one row; `segment_top_movers` jsonb from `segment_daily_stats`, top 5 by absolute change), `identity_timeline` (identity plus completed-merge sources; kinds `session_started/session_ended/location/event/visit_checked_in/visit_checked_out`; newest first, limit 1..500, row-id tiebreak).
- **abnormal_movement** (Stage B hook replaced; `evaluate_detection` unchanged): previous area = latest earlier located area in the session; counts from the 30 local days before the detection's day (today excluded, still being aggregated); abnormal when pair count <= `abnormal_movement_max_count` (default 1) and outgoing(from) and incoming(to) >= `abnormal_movement_min_total` (default 20), both new `organization_settings` columns. Severity medium, dedup key `session:<id>:abnormal_movement:<to_area>`.

### Task 2: reports (migrations 120-128)
- **Tables**: `reports` (code `REPORT-xxxxx`, status machine, `attempts`, `attempts_at_retry`, `lease_expires_at`), `report_facilities`, `report_segments`, `report_templates` (extra `format`; `is_system` ro; `report_type` insert-only), `report_schedules` (cron subset via `itap.valid_cron`, timezone CHECK, channel email/webhook/in_app, `last_run_at`/`next_run_at` ro, `last_error`/`last_failed_at` ro), `report_metrics` (ro). Result table `report_datasets`. Notification deliveries gained the composite FK `report_id` (SET NULL; a report deleted by retention leaves a delivery with `content.report_code`).
- **Types**: flow, occupancy, heatmap, behavior (snapshot of 30-day visit buckets), attendance, segment, compliance, device_health, incident, plus `incident_summary` (Task 5). Event type `report_generated` is new (it was not in `event_types`).
- **Pipeline**: `render_report` event trigger (insert + status) -> `claim_report` (lease 5 min, attempt + 1, 3 attempts) -> `compute_report` (SQL dataset + metrics, rows capped at 10 000) -> render (CSV, JSON, PDF, XLSX) -> upload (`metadata.kind = report`) -> `complete_report` (event `report_generated`, incident activity for incident reports, schedule deliveries per recipient-group member, then `finish_events` so Stage C runs). Failure: `fail_report` guarded by attempt, uploaded file deleted. `retry_report` (org_admin) failed -> queued. `due_reports` reclaims stale rows.
- **Schedules**: cron `run_report_schedules` (every 15 min, tolerance 1800 s) -> `init_report_schedule` / `run_report_schedule` guarded by `next_run_at`, report for the previous complete period in the schedule timezone, `ON CONFLICT (schedule, start, end)`; each schedule isolated (failure recorded on the schedule, others and `due_reports` still run).
- `generate_incident_report` is a SQL mutation function (org_admin), not an action.

### Task 3: search (migrations 129-133)
- **Tables**: `search_requests` (extra `saved_search_id`, `fuzzy`, `error`, `face_count`, `started_at`, `completed_at`, later `bulk_job_id`/`bulk_job_row_no`; statuses queued/running/completed/failed), `search_results` (ro rows), `saved_searches` (extra `owner_id`, `description`, `threshold`, `max_results`, `fuzzy`, `next_run_at`, `last_run_status`, `last_error` (owner-only through computed field `owner_last_error`), `last_search_request_id`). History and request rows are **owner-only**; saved searches are visible to the owner and, when `is_shared`, to the org (update/delete owner only).
- **Search**: SQL `search_identities` (top-N over effective identities; `matching_enabled = false` identities never returned; filters validated by `valid_search_filters`; merge sources folded into facility/seen/date filters), shared TS `runSearch` (action `search_faces`, cron, bulk). Match types exact >= threshold + 0.15, partial >= threshold, fuzzy >= max(threshold - 0.1, 0.2) when requested. Several faces -> largest box; `no_face`/`low_quality`/`invalid_image` are recorded as failed requests.
- **Saved searches**: cron `run_saved_searches` hourly; guarded by `next_run_at`; owner must be an active, enabled member (`skipped/owner_inactive`); alerts (`saved_search_match`, medium) only for identities new relative to the previous completed run; timestamps at the cron's scheduled time.
- Owner-only file kind `search`; org_admin uploads now record `uploaded_by_user_id` (storage insert preset).

### Task 4: bulk jobs (migrations 134-139)
- **Tables**: `bulk_jobs` (code `BULK-xxxxx`, kinds profile_import/profile_update/bulk_search, statuses queued/running/completed/partial/failed/**cancelled**, counters, errors jsonb capped at 500 rows, lease/attempts like reports), `bulk_job_rows` (outcomes created/updated/validated/skipped/failed/matched/no_match; `private_owner_id` on bulk_search rows).
- **Execution**: `run_bulk_job` event trigger starts the job detached in the backend; cron `resume_bulk_jobs` (every minute, tolerance 120 s) reclaims expired leases. Each profile row is applied by `bulk_apply_profile_row` AS THE JOB OWNER in one transaction with its `bulk_job_rows` row (idempotent on job + row_no; successful rows returned as is). Dry run = subtransaction rolled back -> `validated`. Progress every 25 rows or 2 s; cancel and reclaim stop the worker. Limits: 10 000 rows, 5 MB. `retry_bulk_job` and `cancel_bulk_job` are org_admin mutations.
- `bulk_search`: input CSV of image file ids, rows through the shared `runSearch` as the owner; job, rows and result file are owner-only (kinds `bulk_input`, `bulk_search_result`).

### Task 5: dashboards and seed (migrations 140-145)
- **`dashboards`**: name, description, `layout` (UI preferences), `widgets`, `is_shared`, `owner_id` (preset, ro); owner CRUD, shared rows readable by the org, audited. Widget contract (`itap.valid_dashboard_widgets`, never raises): at most 50 widgets, each exactly `id` (unique, 1..64), `kind` (kpi, occupancy_series, flow_matrix, heatmap, incidents_list, segment_trend, device_health, deliveries), `title`, `query` (root field allowed for the kind, see `itap.dashboard_widget_queries`; every source is permission-checked for the viewer), `params` (free-form), `position` {x,y,w,h} on a 12-column grid (x + w <= 12, h 1..24).
- **Stage B**: `after_hours` is suppressed when the profile's work schedule overlaps the detection time +/- 30 min (`itap.profile_rostered_at`, interval test, schedule timezone). Attendance matches a scheduled day against sessions from 2 h before the earliest window start to 22 h after; a 24/7 window is never "late".
- **Seed** (steps in `apps/backend/src/seed/analytics*.ts`): per-day `aggregate_stats_range` interleaved with the 30-day replay (7 `abnormal_movement` events), night shift replayed, 10 system report templates per org, 10 completed reports with files (+1 failed), 3 weekly occupancy schedules to email and 3 daily incidents to in-app, searches (4 facial, 3 attribute, saved searches), bulk jobs (import, partial import, bulk search), 2 dashboards. `pnpm seed --reset` takes about 160 s (+25 s); a second run 2 s.

## Rulings (from the ledger)

- No new dependencies for cron/CSV/PDF/XLSX; plan tasks are headline-level, spec and global constraints are the requirements.
- `aggregate_stats` does not call `run_activity_stats`; `aggregate_stats_range` exists for the seed and is equivalence-tested against hour-by-hour runs (0 differences on 31 days).
- Stats FKs to facilities/areas are `ON DELETE CASCADE` (derived, re-computable data), deviating from the NO ACTION default.
- No parent-area roll-up in hourly stats; the timeline uses location rows with detection ids; UI sums the subtree if needed (unique counts cannot be summed).
- `aggregate_stats` re-aggregates a trailing window so late closes and missed runs heal.
- `compute_report` in SQL, rendering in the backend; `report_generated` event drives webhooks via Stage C; schedule deliveries via the report origin.
- `report_templates.report_type` is insert-only; per-schedule error isolation in `runSchedules`; monotonic fencing token across retries (`attempts_at_retry`); orphan file sweep on claim; targets mutable only while queued; report files treated as sensitive in `open_file` audit.
- Shared `searchService` for action, cron and bulk; owner-only history; consent-withdrawn identities never returned; uploader recorded on org_admin uploads.
- First run of an alerting saved search, or after a definition change, only records the baseline (no burst).
- Full integration suite once per task; small fixes verified by affected files (owner decision). Tests are never run in watch mode (`vitest run`); a 19-hour-old watch-mode `pnpm test` left by an earlier agent was killed.
- `bulk_job_rows` + idempotent SQL row apply for crash-safe resume; rows applied as the job owner; lease fencing like reports.
- Report type `incident_summary` accepted (schedulable incidents report); Stage B `after_hours` suppressed for rostered staff (+/- 30 min).

## Deviations from spec

- §6.10: extra columns `reports.attempts/attempts_at_retry/lease_expires_at`, `report_templates.format`, schedule `last_error/last_failed_at`, stats `dwell_seconds`/`guest_visits`; report type `incident_summary`; event type `report_generated`; stats FKs CASCADE; `aggregate_stats` does not compute identity-confidence refinement and does not refresh activity stats.
- §6.11: extra columns on search/saved search tables; statuses `queued/running/completed/failed` for requests; `cancelled` and outcomes for bulk jobs; new `bulk_job_rows`.
- §8.4: `render_report` also fires on status updates (Hasura cannot filter by value); `run_bulk_job` runs detached with a resume cron.
- §8.5: `generate_incident_report` is SQL; `search_faces` returns extra `status`, `face_count`, `error`; `search_identities` takes `p_embedding` as text and `p_fuzzy`.

## Deferred minors and known limits

- Sessions closed later than the trailing window (more than about `timeout + 3 min` after a missed run) lose their exit until a manual `aggregate_stats_range`.
- `devices_offline` in `dashboard_kpis`: non-inactive devices with health critical or status connection_error; day rows of the day in progress include data after the aggregated hour (deliberate, so runs never regress a day).
- Report deliveries bypass quiet hours and digest mode by design. A missed schedule run is not replayed; the next run produces the most recent period (oldest missed periods are skipped).
- Facility-local daily stats are filtered by the report's dates, exact only when facility and report timezones match.
- Attendance uses `tracking_sessions.profile_id` captured at session open (ignores later re-links and merges). Behavior report is a snapshot, not bound to the period.
- Compliance report counts every audit entity including private ones (counts only).
- PDF/XLSX are simple: cells cut at 40 characters in the PDF, non-Latin-1 becomes `?`, XLSX has no styles. File cleanup after failures is best effort; retention (slice 10) can sweep by `metadata.report_id`.
- Saved-search match events are org-visible (alerts are organization-wide by design). A shared facial saved search shows its definition but others cannot open the image or run it. Same-day dedup: an identity leaving and re-entering results the same local day is not alerted twice. A removed baseline silently re-baselines. Each facial run calls InsightFace again (no embedding cache). If `finish_saved_search_run` fails after the search, the retry adds one extra history row.
- Bulk: retry by another org_admin still runs as the original owner (org operation); audit rows of bulk_search job inserts are org-visible (definition only); CSV leniencies: trailing blank line, trailing empty columns, lenient quotes; a literal BOM is stripped; cancelled jobs have no result file. A backend restart mid-job loses at most the lease.
- Seed: attendance absent rate (13%) is above the replay's 5% (unlinked employees, 24/7 schedule on Sundays); past reports are seeded only when the organization has none (an interrupted seed needs `--reset`); profiles from the seeded import keep the seed run's `created_at`.
- A new or rescheduled schedule gets `next_run_at` only at the next 15-minute run.

## Carry-overs: pending for the slice-7 final review ("Carry -> final wave")

- CSV formula guard: prefix any cell starting with `-` unless it is a plain number (`^-?\d+(\.\d+)?$`).
- NUL characters in a bulk cell must fail the row (`invalid_value`).
- An InsightFace error on a bulk_search row must be a row failure (`search_unavailable`).
- `bulk_apply_profile_row` must re-raise 40P01 / 40001 / 55P03 (deadlock, serialization, lock timeout) instead of recording a row failure.
- Close stale bulk search requests (left running) at job claim.

## Owner actions (not done by the agents)

- Rotate ALL secrets: Hasura admin secret (`change-me`), JWT key, Postgres password, action secret.
- Audit production Postgres for the slice 3/4 attacker persistence (superuser role `priv_esc`, event triggers `log_start`/`log_end` running `public.escalate_priv()`, database `readme_to_recover`). The dev DB volume was rebuilt clean on 2026-10-19 (owner-approved), migrations re-applied and seed re-run, so dev is clean.
- Production: `WEBHOOK_ALLOW_PRIVATE_TARGETS=false`, `WEBHOOK_SINK_ENABLED=false`, `BACKEND_URL` reachable from Hasura, `ACTION_SECRET` set. Nothing is merged to `main`; production untouched.

## How to run

```bash
make dev-compose && make hasura_apply
pnpm --filter nhost metadata:generate
pnpm seed                              # --reset re-creates the demo data (about 160 s)
pnpm --filter nhost test
pnpm --filter backend exec vitest run src      # never watch mode
pnpm --filter backend test:integration
RUN_SEED_TEST=1 pnpm --filter backend test:integration -- seed
```

Live demo: after `pnpm seed`, query `dashboard_kpis`, `occupancy_series` and `flow_matrix` as org_admin; open the seeded reports' files via `open_file`; insert a report (it renders within seconds through `render_report`); call `search_faces` with an uploaded photo; upload a CSV (`kind = bulk_input`) and insert a `bulk_jobs` row, optionally with `dry_run`.
