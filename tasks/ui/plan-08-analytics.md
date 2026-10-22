# ITAP Console Phase 8 — Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboards (renderer and editor over the widget contract), analytic blocks (occupancy series,
flow matrix, heatmap, identity timeline reuse), stats views, and reports (templates, schedules,
generated files, retry).

**Architecture:** A new `analytics` ConsoleModule. Each widget kind is a buro block reading its tracked
query (`dashboard_kpis`, `occupancy_series`, `facility_occupancy_now`, `flow_matrix`, `area_hourly_stats`,
`incidents`, `segment_daily_stats`, `devices`/`device_health_metrics`, `delivery_report`) through
`defineQuery` + `source.query`; the dashboard page renders a 12-column grid of widget blocks from
`dashboards.widgets`; the editor is a form over the widget contract with live preview (design call 3).
Reports are records whose files are opened through `open_file`/presign.

**Spec:** `tasks/ui/design.md` §10 call 3; data model `tasks/data-layer/design.md` §6.10 (widget
contract `itap.valid_dashboard_widgets`, report types/statuses/guards, schedules), §8.3–§8.4
(`aggregate_stats`, `render_report`, `run_report_schedules`).

## Global Constraints

- Earlier Global Constraints and `IMPLEMENTER-CONTEXT.md` apply.
- Widget JSON exactly per the contract (≤ 50 widgets, ids unique, kinds and allowed queries, position
  integers on a 12-column grid with `x + w ≤ 12`, `h` 1..24); invalid widgets are refused client-side
  with the same rules and the editor shows which.
- Charts are plain SVG components shared in `src/blocks/charts/` (line/area, bar, matrix/heatmap) —
  no chart library; reuse the health-chart pattern.
- Dashboards are owner-editable; shared ones read-only for others (rules with reasons).
- Reports: type/parameters/dates/format insert-only; no delete; `retry_report` only on failed;
  incident reports created from incidents (phase 5) appear here.

## Review Focus

1. A widget whose query the viewer may not read renders a "no access" tile, not a broken dashboard. — Task 2.
2. Editing a shared dashboard someone else owns is not offered. — Task 2.
3. A report range over 366 days or end before start is refused before submit. — Task 3.
4. A failed report shows its error and a Retry; a completed one opens its file. — Task 3.
5. Occupancy series respects the facility timezone for day boundaries. — Task 1.

---

### Task 1: Analytic blocks and stats views
Shared SVG chart components; blocks `itap:occupancy-series`, `itap:flow-matrix`, `itap:heatmap`,
`itap:kpis` (facts over `dashboard_kpis`), `itap:incidents-list`, `itap:segment-trend`,
`itap:device-health-summary`, `itap:deliveries`; read-only resources for `area_hourly_stats`,
`facility_daily_stats`, `area_transitions_daily`; an "Analytics" page composing them for the selected
facility and a period picker. Commit `feat(ui): analytics blocks and stats`.

### Task 2: Dashboards
Dashboard resource (name, description, shared, owner), dashboard page rendering widgets in a 12-column
grid, editor (add/remove/reorder widgets, kind → query → params form, position fields, live preview),
contract validation, default dashboard as the landing page option. Commit `feat(ui): dashboards`.

### Task 3: Reports

Carry-over from phase 6: turn `notification_deliveries.report_id` (raw id today) into a relation to the report resource.
Report templates (system read-only), reports (create flow per type with parameter forms, facilities and
segments links, period; status timeline; open file; retry), schedules (template, cron with a readable
summary field type, timezone, recipient group, channel, active, last/next run). Commit `feat(ui): reports`.

### Task 4: Phase close
e2e `analytics.spec.ts`, gates, demo `phase-08-analytics.webm`, `summary-08-analytics.md`, gaps/roadmap, push.
