# Summary — phase 8: Analytics

Plan: `plan-08-analytics.md`. Spec: `design.md` §10 call 3; data model `tasks/data-layer/design.md` §6.10,
§8.3–§8.4. Framework gaps: `buro-gaps.md` (G57–G62). Branch `feat/ui-console`, base `0e8786e`:
analytic blocks and stats `e3e4c7b` + review fixes `12fb2a8`, dashboard console fields (data layer)
`3498092`, dashboards `25898f6` + review fixes `fff900f`, reports `8e4e724`, report `requested_by_me`
(data layer) `0b2dacd` + review fixes `33578b2`, dev-stack test pagination fix `a8dcacc`, the analytics
smoke suite `1449a96` and this summary.
Demo video: `playwright-output/phase-08-analytics.webm` (the Analytics page for Nova Tower with the
7-day and 30-day tabs, the seeded shared "Security overview" dashboard, a new dashboard built in the
editor with two widgets (one refused first with its reason, then fixed) and its live preview, saved and
deleted, the failed seeded report with its error and Retry, New report refused at more than 367 days,
then sent, followed to completion and its file opened; git-ignored like the earlier videos).

## What was built

All in `apps/admin-ui/`, in a new `analytics` ConsoleModule (`src/modules/analytics/`), nav section
Analytics (Analytics, Dashboards, Reports, Report templates, Report schedules, hourly stats, daily stats,
area moves).

- **Shared SVG charts** (`src/blocks/charts/`, no chart library): line, bar (one- and two-sided), heat
  grid, stacked bar, each with a visually hidden data table and an accessible name built from the data;
  zoned-time helpers that read wall times the way Postgres does (DST gaps and repeats), the periods and
  facility-day windows, `useEnumLabel` (G59).
- **Analytic blocks**, one folder each, with explicit props (facility, period, limits) so a dashboard
  widget's params decide what is read: `itap:occupancy-series`, `itap:flow-matrix`, `itap:heatmap`
  (hourly stats or the occupancy series), `itap:kpis`, `itap:incidents-list`, `itap:segment-trend`,
  `itap:device-health-summary`, `itap:deliveries`, `itap:device-health-day`; reused `itap:occupancy-now`
  and `itap:health-chart`. Days follow the facility's time zone (Review Focus 5); row caps show a note.
- **Analytics page** (`/analytics`): key figures, then period tabs (last 7 days, 24 hours, 30 days; kept
  in the URL, G57) with occupancy over time, busy hours, movement between areas, segment trends and
  deliveries, then open incidents and device health for the sidebar facility.
- **Stats resources** (read only, facility-scoped): `area_hourly_stat`, `facility_daily_stat`,
  `area_transition`.
- **Dashboards** (`/dashboards`): Mine / Shared with me views; the record page draws the widgets on a
  12-column grid (`itap:dashboard-grid`, G60) for the sidebar facility. Each tile shows its block or why
  not: refused by the contract or its settings (with the reason), "no access" when the role cannot read
  the query (Review Focus 1), "choose a facility" / "choose a device", or a failed draw inside its own
  error boundary. The editor field `itap.dashboard-widgets` (title, kind, source, settings per source,
  position, move/remove/add) checks the exact rules of `itap.valid_dashboard_widgets` and puts each
  refusal on its widget, with a live preview below the form. Someone else's shared dashboard: Edit and
  Delete disabled with the reason, the form locked (Review Focus 2). "On my Dashboard page" makes one
  of your dashboards the landing page's "My dashboard" panel.
- **Reports** (`/reports`, list polled every 10 s; Mine, Failed, Scheduled, Incident reports views):
  New report is a flow (type first, then period / incident / facilities / segments by type; G62) that
  refuses an end before the start and more than 367 days before sending (Review Focus 3). The page
  shows "Generation failed" with the error and Retry (failed only) or the File panel with the open link
  (Review Focus 4), and the `itap:report-status` steps, followed live (G61). Templates (built-in ones
  read-only), schedules with the `itap.cron` field (the database's cron subset, a readable sentence, a
  "never runs" warning) and the recipients check. Notification deliveries' `report_id` is now a
  relation; incidents have a Reports tab.
- **Data layer** (dev only; other environments need `make hasura_apply`):
  - migration `1792365700285_dashboard_console_fields`: computed `dashboards.owned_by_me`, column
    `dashboards.is_default` (one per owner; setting it clears the previous one);
  - migration `1792365700286_report_requested_by_me`: computed `reports.requested_by_me`.

## Reusable for later phases

- The chart components, `ChartTable`, `chartLabel`, `useEnumLabel`, the zoned-time and period helpers,
  `useFacilityPeriod` (search and bulk statistics, access decisions over time, face-auth attempts).
- `ANALYTIC_BLOCKS` / `DASHBOARD_WIDGET_QUERIES`: a new analytic block becomes a dashboard source by an
  entry there and in `widget-views.ts` (the compiler enforces the pair).
- The `itap.cron` field (export definitions and integration schedules in phase 12) and the report-status
  pattern (a block that polls a background job and asks the page to re-read: bulk jobs, exports, DSRs).
- `requested_by_me` / `owned_by_me` computed fields for "Mine" views.

## Rulings (from the ledger)

- The analytic blocks take explicit params (facility, period, query params) so dashboards pass the
  widget's params; Task 2 owns the kind → block map; the identity timeline reuses the phase-4 block.
- Task 1 review: silent caps and chart accessibility fixed; the facility-less widget on a dashboard went
  to Task 2 (sidebar facility fallback); M7 (stale window while the zone is cached) and M8 (1000-row
  caps) parked as cosmetic.
- Task 2 minors fixed without a re-review (pinned by tests). Task 3: the G61 workaround moved to the
  public dispatcher (`effects.refetch`); minors M5 and M6 parked as cosmetic.

## Found by the smoke suite and the demo

- The admin (`admin@itap.demo`) owns the seeded "Security overview", so it is editable for them; the
  read-only case of someone else's shared dashboard is covered by the jsdom page test only (the seed's
  other Nova dashboard, "Facility manager", is private to `nova.admin`).
- A flow button and its help button share the name ("Retry" / "Help: Retry", "New report" / "Help: New
  report"): the suite targets the flow by its test id.
- The dev-stack tests listed rows with `pagination: { mode: 'offset', perPage }`, a shape the provider
  does not read (buro's is `{ kind: 'offset', page, pageSize }`), so they got the default page of 25.
  The fixed manual segment's history passed 25 rows and the phase-7 membership test failed; the nine
  dev-stack test files now use the right shape.
- `pnpm --filter admin-ui test:e2e -- <spec>` forwards the `--` and runs every spec; pass the spec to
  Playwright directly (see How to run).

## Framework gaps met

- G57 no page-parameter control (the period tabs repeat their placements).
- G58 a placement has no title, a grid no column count.
- G59 no field label / enum label string for a view.
- G60 a block cannot place blocks chosen from data (the dashboard grid draws block views itself).
- G61 a record page does not poll its record (the report-status block asks for the re-read).
- G62 a link cannot be written with its record (New report is a flow with a nested insert).

## Deferred and residues

- The dashboard tiles lose buro's placement chrome (pending, failed, Retry) since the grid draws views
  itself (G60); "no access" checks only the widget's own query, not the extra reads of
  `deviceHealthDay` / `occupancyNow`, and relies on role introspection of `query_root`.
- The landing dashboard can only be one of your own; "Move earlier/later" trades places but does not
  repack; vertical gaps close up when drawn; a tile with a small fixed height scrolls (the seed's KPI
  tile).
- Heatmap periods are capped at 31 days (20 000 rows); the segment trend for "largest segments" reads
  every segment's rows of the period (10 000 cap), with a truncation note.
- The older `segment-stats` and `health-chart` drawings are not moved onto the shared charts.
- New report offers no template; a template's own time zone cannot be edited; deleting a template a
  schedule uses reads as the generic refusal (G54); "Check again" after a lost answer matches your own
  report by title within a minute.
- The owner column shows a user id for `admin@itap.demo` (its `displayName` is empty, as before).
- Test residues: none. The smoke suite deletes its own dashboard from the console (an afterAll sweep with
  the admin's own token covers a failed step) and never sends the refused report. The dev tests delete
  their reports through `run_sql` in `itap.retention_context` (admin secret, test cleanup only), and
  so does the demo script for its report. Report codes keep counting (the sequence is not reset).

## Known limits

- Hour buckets for zones with a non-whole-hour offset fold each UTC hour on the local hour it starts in.
- `itap:incidents-list` lists newest first (severity is filtered, not sorted).

## Gates

With `ITAP_DEV_STACK=1`: 138 files, 1030 tests; the one run had 1029 passed and 1 failed (the phase-7 membership dev test, see below), and after the fix the nine touched dev-stack files passed again (42 tests). e2e `analytics.spec.ts` 5 passed; `people.spec.ts` and
`segments.spec.ts` passed (6 and 3, regression for `full_name`). Lint, typecheck and build clean;
`pnpm --filter nhost test` 100 passed.

## How to run

```bash
make dev-compose && make hasura_apply && pnpm seed  # dev stack, migrations and demo data
pnpm --filter admin-ui dev                         # console on http://127.0.0.1:5173
pnpm --filter admin-ui lint && pnpm --filter admin-ui typecheck
pnpm --filter admin-ui test                        # unit/jsdom
ITAP_DEV_STACK=1 SEED_PASSWORD=... GRAPHQL_ADMIN_SECRET=... pnpm --filter admin-ui test   # + dev-stack tests
ITAP_DEV_STACK=1 SEED_PASSWORD=... pnpm --filter admin-ui exec playwright test -c e2e/playwright.config.ts analytics.spec.ts
pnpm --filter admin-ui build
```

`SEED_PASSWORD` and `GRAPHQL_ADMIN_SECRET` are in `apps/backend/.env`. Sign-in is limited to ten per five
minutes; leave about five minutes between a dev-stack run and an e2e run.
