# ITAP Console on buro — Design

Status: draft for owner review (2026-10-21).
Inputs: data layer `tasks/data-layer/design.md` (slices 1–10, as built), buro 0.6.0 study notes
(framework source `/home/dev/Projects/refiner/refinest`, example `examples/marketplace-ops`).

## 1. Intent

Replace the old `apps/admin-ui` (Refine; 4 pages; 109 GraphQL errors against the new schema) with a
new console that covers the whole ITAP data layer, built on the owner's framework **buro**
(`@burojs/*`). The console is also a real-world proving ground for buro: it should use the
framework's mechanisms to the maximum, and every place where buro is missing something an admin
framework is expected to have is written down for the framework, not hacked around.

The console is shown only when complete, so there is no "first demo" slice; order of work is the
builder's (§9).

## 2. Goals

- Every functional module of the data layer has screens: tenancy, people (identities, profiles,
  companies, visits), segments, facilities/areas/floor plans/access points, devices, live
  recognition and tracking, events/incidents/watch lists/shift handovers, notifications/webhooks/
  on-call, analytics/dashboards/reports, search/bulk jobs, physical access (policies with four-eyes
  approval, grants, overrides, decisions, terminal sync), face authentication (client apps, keys,
  attempts, review), compliance (retention, legal holds, DSR, processing activities, integrations,
  exports, system status), audit log.
- Server logic is reached through the data layer as built: tracked SQL functions and Hasura actions
  become buro custom operations (`defineQuery` / `defineMutation`) behind flows; nothing is
  re-implemented in the browser.
- Maximum framework use: declarative resources, layout trees, record types, flows, checks, rules,
  frames, blocks, custom pages, custom field types, enums with badge colours, saved views, export,
  command palette, embedded docs, `checkApp`.
- Field and resource documentation is written from the start in buro's embedded-docs format.
- All declared texts in English; translations are added later as locale bundle files only.

## 3. Non-goals and anti-goals

- No changes to the data layer unless a screen proves a real gap (then a small, separate data-layer
  task; the console never works around a permission or a missing function client-side).
- No second data client (no Apollo/urql, no hand fetches for CRUD); everything goes through buro's
  provider, custom operations or blocks' `data`.
- No reimplementation of what buro does (lists, forms, filters, URL state, dialogs, toasts, shell).
- No heavy workarounds for buro gaps that are announced (many-to-many); defer instead.
- Anti-goal: a console that "looks done" but whose flows call nothing real (CLAUDE.md "do not fake").
- Anti-goal: inline locale maps, Russian or any non-English text in code.

## 4. Constraints

- `@burojs/*` from npm, all packages pinned to the same exact version (`0.6.0` now; upgrade by
  release). Peers: React 19, Tailwind v4, `i18next`, zod 3.x, `@tanstack/react-query` at buro's
  version.
- Vite SPA + react-router 7 (buro's router adapter), as in `marketplace-ops`. No SSR.
- Project rules: TypeScript strict, no `any`, no `console.log`, files about 300 lines or less,
  English code, lucide icons (buro string icon names + `registerIcons`).
- Hasura v2.46 with one role `org_admin` (plus `user` before an organization is chosen); the
  console never uses the admin secret.
- Auth: Nhost auth (email/password) → base token (role `user`) → action `switch_organization` →
  organization token (role `org_admin`, 15 min, claims carry organization id). Renewal is the
  client's job (data-layer design §4.3).
- Files: hasura-storage (MinIO) with org buckets; sensitive kinds are opened only through action
  `open_file` (short-lived URL + audit).
- Quality gates: `pnpm lint`, `pnpm typecheck`, `pnpm build`, vitest (never watch mode), Playwright
  against the dev stack, demo recording for UI changes (CLAUDE.md).

## 5. Decisions taken with the owner

- Framework: buro, latest release; consumed from npm (not linked from the local checkout).
- Language: English in code; translations later as bundles.
- Docs: fill field/resource documentation from the start, per buro's embedded-docs model.
- Custom needs are built the framework way (custom field types, blocks, frames, pages).
- Many-to-many: do not over-engineer; it is coming in buro; defer what needs it.
- Framework gaps go to a separate file: `tasks/ui/buro-gaps.md`.
- Order of modules: builder's choice; the console is shown when complete.

## 6. Architecture

### 6.1 App layout (`apps/admin-ui`, replaced in place)

```
apps/admin-ui/
  index.html                pre-paint theme script
  src/main.tsx, app.tsx     router, RouterAdapter, LinkComponent, async runtime boot, BuroProvider, AppShell
  src/app/                  app-definition.ts (the single use() list), nav sections/groups, icons,
                            app-level rules, frames, app actions, landing/dashboard page
  src/auth/                 token store, Nhost + org-token AuthProvider, login page, org picker, RequireAuth
  src/data/                 hasura provider config, resource mappings, custom operation registry
                            (documents), defineQuery/defineMutation handles, query client
  src/enums/                defineEnum for every Hasura enum table used on screen (badge colour/icon)
  src/fields/               custom field types (declaration + implementation)
  src/blocks/               shared custom blocks (with their views)
  src/modules/<module>/     one folder per functional module: resources (fields, views, actions,
                            checks, rules), module blocks, docs/*.md articles
  src/i18n/                 locale registry; en bundles hold docs only (labels live in code);
                            other locales added later as files
  src/docs.ts               DocsConfig (articles, concepts), Help page
  tests/                    checkApp, docs integrity, mapping-vs-schema, frames, flows (vitest)
  e2e/                      Playwright against the dev stack
```

Old Refine code, its codegen config and dependencies are removed. CLAUDE.md "Frontend" and
"Frontend Patterns" sections are rewritten for buro in the first task.

### 6.2 Data

- One `@burojs/hasura` provider (`hasura`), endpoint `/v1/graphql`, `getToken` reads the current
  organization token from the token store per request, `defaultRole: null` (role comes from the
  token). Each resource maps to its GraphQL `custom_name` (`areas`, `profiles`, …), `pkType: 'uuid'`,
  an explicit `orderByField` (usually `created_at`), `selectFields` = declared fields.
- Resource field names equal column names; relations are FK columns with `f.relation({ to })`.
- Count: `_aggregate` is allowed everywhere; large append-only logs (detections, locations,
  decisions, attempts, deliveries, audit, metrics) use `noAggregate` + `count: 'manual'` and
  cursor pagination where the sort allows it.
- Enum tables are not resources; they become `defineEnum` declarations (values from the data-layer
  design, colours/icons chosen per enum) and fields bind them with `meta.enumNamespace` / `ui.enum`.
- Custom operations: one closed registry of GraphQL documents for tracked SQL functions and Hasura
  actions; each wrapped as `defineQuery` (with `reads`/`tags` and labelled `fields` for `facts`) or
  `defineMutation` (with explicit `effects`). Flows submit them.
- Function result tables (`itap_results.*`) are not resources; they are output shapes of queries.
- Many-to-many: buro 0.6.0 links (`f.relationMany({ to, through })`) for chips, filters and
  read-only link panels; junction tables are also registered as hidden resources so rows can be
  added/removed through a `relatedList` of the junction until link writes ship (gap G5).
- To-one context in lists via dotted relation columns (`'company_id.name'`, up to three hops),
  which Hasura answers with nested selects; mappings name relationships where the field name differs.
- Facility narrowing via `data.scope: { facility: { field: 'facility_id' } }` on facility-dimension
  resources; organization isolation stays in the token (never a client scope).
- A test boots every mapping against the live schema (introspection as `org_admin`) so a wrong
  `custom_name`, pk type or column fails in CI rather than on a screen.

### 6.3 Auth and tenancy

- Token store (module-level, subscribable): base session (Nhost access + refresh token), current
  organization token (+ expiry, organization id).
- `AuthProvider`: `login` = Nhost sign-in, then `switch_organization` for the last organization
  (`user_settings.last_organization_id`) or the org picker when there is more than one;
  `getIdentity` = user + memberships + current organization; `onError` on `kind === 'auth'` renews
  (refresh Nhost token → re-switch) single-flight, then `refreshed` or `logout`; proactive renewal
  shortly before the organization token expires.
- Organization switch = new token + `dataSession.rotateSession()` (clears cache, drafts). Sidebar
  header holds an organization `ScopeSwitcher`; results of the switch are handled (never dropped).
- Facility scope: a facility picker in the sidebar `filters` slot sets
  `dataSession.replaceScope({ facility })` (read by resources declaring `data.scope`) and the
  resolver `scope` slice for rules/refs; "all facilities" = no value. Picker state is app code
  (gap G6).
- Permission map: one role today, so `requires` is used only where buro needs it (e.g. sensitive
  fields), with a table-driven map ready for the six future roles.

### 6.4 Screens: how each kind of thing is built

| Need | buro mechanism |
|---|---|
| CRUD of configuration (companies, schedules, watch lists, recipient groups, templates, …) | resource with list/show/edit/create views, layout tree, checks |
| Read-only logs (detections, events, decisions, attempts, deliveries, audit, device metrics) | resource with `operations` off, filters, saved views, cursor lists, export |
| State machines (incident lifecycle, verification, visits check-in/out, DSR, bulk/report retry) | item/bulk flows over custom mutations, `rules` with `fallback: 'disable'` + reason, checks |
| Versioned entities (access policies, event rules) | header resource + version resource; draft edited as a record; submit/approve/reject/publish/archive flows; versions as `relatedList` timeline |
| Polymorphic exactly-one targets (grants, legal hold targets, policy subjects/targets) | record `types` keyed by a discriminator, or a custom field type "one of" (decided per case in the plan) |
| Composite or special values (time windows `[{days, from, to}]`, polygons, conditions JSON, money-free) | custom field types: `time-windows`, `segment-conditions` (field catalog from `segment_fields`), `notification-conditions`, `shape` (on floor plan), `cron` |
| Live camera + recognition overlay, floor plan with occupancy, occupancy series, flow matrix, heatmap, identity timeline, KPI tiles | custom blocks (views in React, data through `data` sources / custom queries); KPIs through built-in `facts` |
| Dashboards (`dashboards.widgets` contract) | custom page rendering widgets as blocks |
| Org-wide jobs (retention plan/run, system status, publish to terminals, recognition start/stop) | app actions + custom pages with `inlineFlow` |
| Files (photos, documents, DPIA, report/export downloads) | `f.file` for display; upload through a custom field implementation storing the file id until buro's edit path is fixed (gap G2); sensitive kinds through `open_file` |
| Socket.io detections | a block that subscribes to the backend socket; list freshness by `refetchInterval` (gap G3) |

### 6.5 Docs and i18n

- Every resource: `texts.label/labelPlural` and `texts.doc.summary`; fields documented where the
  label does not carry the meaning (codes, system-written values, thresholds, statuses, relations);
  flows/checks carry `texts`. Hand-written articles per module in `docs/*.md` (what it is, lifecycle
  with a mermaid diagram, how actions decide). Glossary concepts for repeated terms (identity vs
  profile, merge, legal hold, four-eyes, epoch, segment kinds, retention class, DSR).
- Help page (custom page with `DocBrowser`), `DocPanel` in the shell.
- Locale registry with primary `en`; framework `en` bundle; app bundles hold docs only; a test runs
  `checkApp` and a docs-integrity check (orphans, empty docs, summaries restating labels).

### 6.6 Testing

- vitest (jsdom where needed): `checkApp` clean, docs integrity, mapping-vs-schema, `checkFrame` for
  each frame, `renderBlock` for each block, `runFlow` for flows with logic.
- Playwright against the running dev stack with the seed: one smoke spec per module (list, open a
  record, run its main flow), page objects from `@burojs/test-helpers`.
- Demo video per module when its screens land (CLAUDE.md).

## 7. Framework gaps policy

`tasks/ui/buro-gaps.md` lists every missing or broken framework capability with evidence strength
and the workaround used. A workaround is allowed only if it is small and removable; otherwise the
feature waits. Known at the start: G1 auth adapter/refresh, G2 `f.file` edit path, G3 live socket
token, G4 `updateMany`, G5 many-to-many, G6 inert picker slices, G7 saved views per browser.

## 8. Risks to spike first

1. Auth chain end to end (Nhost → org token → Hasura through buro provider → renewal on expiry).
2. Hasura provider against our real schema (custom names, uuid pks, `_aggregate`, permissions
   errors mapping, cursor lists).
3. File upload into an org bucket and display/opening (incl. sensitive `open_file`).
4. A custom operation round-trip (SQL function query + action mutation) through a flow.

## 9. Order of work (builder's choice)

0. Foundation: new app skeleton, auth/tenancy, shell, enums, mapping test, docs/i18n plumbing,
   CLAUDE.md update, the four spikes.
1. Organization: settings, members, invitations, companies, work schedules, custom attributes.
2. Places: facilities, area tree, floor plans (block), access points, templates.
3. Devices: devices, health, events, live camera block, recognition start/stop.
4. People: profiles (documents, consent, restriction), identities (photos, enrollment, merge/split,
   duplicates, verification), visits.
5. Monitoring: detections, tracking sessions, occupancy, events, event rules (versions), incidents,
   watch lists, shift handovers, operator dashboard.
6. Notifications: rules, templates, recipient groups, escalation, on-call, subscriptions, inbox,
   deliveries, webhooks.
7. Segments: manual/dynamic with the conditions editor, preview/evaluate, stats.
8. Analytics: dashboards, reports (templates, schedules, downloads), stats views.
9. Search and bulk: face/attribute search, saved searches, bulk jobs.
10. Access control: policies with four-eyes, grants, overrides, decisions, terminal sync, simulation.
11. Face authentication: client applications, keys, attempts, review, console authenticate.
12. Compliance: retention, legal holds, DSR, processing activities, integrations, exports, system
    status, audit log.

## 10. Builder's calls (not discussed with the owner; review these)

1. **Blocked by a buro gap:** a small workaround is allowed only when it is itself a framework
   extension point (a custom field implementation, a block, a frame, a provider wrapper) and is
   logged in `buro-gaps.md`; anything else waits for a buro release. buro fixes are the owner's,
   not part of this work. "Complete" = every module done except items explicitly parked on a gap.
2. **Face images:** file upload plus webcam capture (a block over `getUserMedia`, frames uploaded
   as files); quality and liveness checks stay server-side (InsightFace). No `@vladmandic/human`
   dependency; the old face-scanner is dropped with the old app.
3. **Dashboards:** renderer and editor. The editor is a form over the widget contract (kind, title,
   query, params, position numbers) with a live preview, not a drag-and-drop grid.
4. **buro upgrades:** take each new release when it lands (all `@burojs/*` together); screens that
   need link writes are scheduled late so they are built once.
5. **Data-layer fixes** found by screens are done inside this work as their own small tasks
   (migration + metadata + tests, same conventions as slices 1–10).
6. **Branch:** `feat/ui-console`, cut from `feat/data-layer-foundation`; pushed, never merged to
   main without the owner.

## 11. Left to the builder

Screen-by-screen layout, which fields are list columns, filter/saved-view choices, enum colours,
block visuals, exact flow forms, per-module plan tasks, how polymorphic targets are presented per
case, which logs use cursor pagination.
