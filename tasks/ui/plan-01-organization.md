# ITAP Console Phase 1 — Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organization administration screens: organization settings (all tunable thresholds,
documented), companies, work schedules (with a reusable time-windows editor), custom attribute
definitions, and the signed-in user's preferences.

**Architecture:** Same app and conventions as phase 0 — read `tasks/ui/summary-00-foundation.md`
("Reusable for later phases", "What phase 1 reuses") first: one `ConsoleModule` per module
(`src/modules/<module>/index.ts`, listed in `src/modules/index.ts`) carrying uses, table mappings
and operation documents (`hasuraOperation` beside `defineQuery`/`defineMutation`); `enumField` for
every enum field; articles in `src/modules/<module>/docs/<scope>/`; `signInDev` and the shared
dev-host constants for dev-stack tests; one e2e smoke per module on the shared session. Phase 1 adds
to the existing `organization` module. Two new reusable custom field types: `timeWindows` and
`timezone`.

**Tech Stack:** as phase 0.

**Spec:** `tasks/ui/design.md` (§6.4 "composite or special values" → custom field types); data model
`tasks/data-layer/design.md` §6.1–6.2, §6.4 (`custom_attribute_definitions`).

## Global Constraints

- Everything in `tasks/ui/plan-00-foundation.md` "Global Constraints" applies unchanged.
- Read column lists and enum values from Hasura metadata (`apps/nhost/nhost/metadata/databases/default/tables/itap_<table>.yaml`)
  and the dev database; org_admin update columns are the only editable fields (others `system`/read-only).
- `organization_settings` has primary key `organization_id` (no `id`): mapping `pkField:
  'organization_id'` and resource `data.idField: 'organization_id'`.
- Time windows JSON shape (data-layer §6.0): `[{ days: number[] (1..7, ISO Monday=1), from: 'HH:MM', to: 'HH:MM' }]`;
  `from > to` means the window crosses midnight; `[]`/null = no restriction where the column allows null.
- Every settings field carries `texts.description` (unit + effect) and `texts.doc.summary` (what the
  system does with it, who reads it — from data-layer design §6–§8).
- New framework gaps go to `tasks/ui/buro-gaps.md`; blockers are deferred and listed in the summary.

## Review Focus

1. A time window that crosses midnight (`22:00`–`06:00`) round-trips unchanged and displays as one
   overnight window. — Task 2 test `keeps an overnight window`.
2. An invalid window (no days, malformed time, equal from/to) is refused in the form with a field
   message before any request. — Task 2 test `refuses an empty or malformed window`.
3. A settings value outside the server's CHECK range is refused client-side with the range in the
   message, and a server refusal (`validation`) still shows on the field. — Task 1 tests.
4. A timezone typed or stored that is not an IANA zone shows as invalid, not silently as UTC. —
   Task 2 test `flags an unknown timezone`.
5. A custom attribute of type `select` without options cannot be saved; options are hidden for
   non-select types. — Task 3 test.

---

### Task 1: Organization settings screen

**Files:**
- Create: `src/modules/organization/settings.ts` (resource `organization_settings`, table
  `organization_settings`; `operations: { create: false, delete: false }`; `views.list.page: false`),
  `src/modules/organization/settings-page.ts` (custom page `organization-settings`, nav
  "Settings" in section `organization`, body block rendering `RecordScreen` for the current
  organization id — reuse the phase-0 profile-page pattern), `src/modules/organization/docs/organization_settings/index.en.md`
- Modify: `src/modules/organization/index.ts` (module object)
- Test: `tests/modules/organization-settings.test.ts`, schema contract test covers new mappings automatically through the module object

**Interfaces:**
- Show/edit tree: panels `recognition` (recognition_threshold, enrollment_duplicate_threshold,
  detection_counter_throttle_seconds), `tracking` (tracking_timeout_seconds,
  tailgating_window_seconds, abnormal_movement_max_count, abnormal_movement_min_total),
  `retention` (archive_unknown_after_days, default_retention_days, consent_embedding_retention_days),
  `access` (policy_revocation_bound_seconds, face_credential_cooldown_seconds; read-only
  policy_epoch, policy_epoch_at, policy_urgent_epoch, policy_urgent_at).
- Field validators mirror the DB CHECK ranges (read them from the migrations SQL or by probing);
  `default_retention_days` documented as unused (data-layer §6.14).
- Check `lowRecognitionThreshold` (warning, edit): recognition threshold below 0.35 → "More people
  will be matched wrongly" (confirm gate).

- [ ] **Step 1: Failing tests** (`describeScreen` / `runFlow`-free): the edit screen shows the four
  panels with exactly the writable fields active and the epoch fields read-only; a value outside its
  range yields the field's validation message containing the range; the low-threshold check fires.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** unit + dev-stack + `checkApp` + docs-integrity — PASS.
- [ ] **Step 5: Commit** `feat(ui): organization settings`.

### Task 2: Reusable `timezone` and `timeWindows` field types; companies; work schedules

**Files:**
- Create: `src/fields/timezone.ts` + `src/fields/timezone-impl.tsx` (declaration `timezone(opts)` →
  string field, `ui` id `itap.timezone`; input = searchable select over `Intl.supportedValuesOf('timeZone')`
  with the current UTC offset; display shows zone + offset; unknown stored zone displays flagged),
  `src/fields/time-windows.ts` + `src/fields/time-windows-impl.tsx` (declaration `timeWindows(opts)` →
  json field, `ui` id `itap.time-windows`, Standard Schema validator for the window shape; input = rows
  of weekday toggles + from/to time inputs, add/remove row; display = compact text such as
  "Mon–Fri 08:00–18:00; Sat 22:00–06:00 (overnight)"), `src/fields/time-windows-format.ts`
  (pure `formatWindows(windows, locale): string`, `validateWindows(value): string | null`),
  `src/enums/organization.ts` (company kind/status enums),
  `src/modules/organization/companies.ts`, `src/modules/organization/work-schedules.ts`,
  `src/modules/organization/docs/company/index.en.md`
- Modify: `src/fields/implementations.ts`, `src/modules/organization/index.ts`, nav
- Test: `tests/fields/time-windows.test.ts`, `tests/fields/timezone.test.tsx`, `tests/modules/companies.test.ts`

**Interfaces:**
- `timeWindows(opts?: { nullable?: boolean; texts?: FieldTexts }): FieldDeclaration`;
  `timezone(opts?: { texts?: FieldTexts; required?: boolean }): FieldDeclaration` — reused later by
  facilities, on-call schedules, report schedules, access policies, segments.
- Companies: list columns name, kind, status, suite, contact_email; search name/contact_email/cost_center;
  filters kind, status; saved views "Tenants", "Contractors and vendors"; show tree with `relatedList`
  of profiles is deferred to phase 4 (people) — note it in the summary.
- Work schedules: name, timezone (`timezone()`), windows (`timeWindows()`), description.

- [ ] **Step 1: Failing tests**: `formatWindows` (weekday ranges collapse, overnight label),
  `validateWindows` (`keeps an overnight window`, `refuses an empty or malformed window`), timezone
  impl `flags an unknown timezone`, companies list declaration (columns, filters, saved views exist).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** all — PASS.
- [ ] **Step 5: Commit** `feat(ui): companies, work schedules, timezone and time-window fields`.

### Task 3: Custom attribute definitions and user preferences

**Files:**
- Create: `src/modules/organization/custom-attributes.ts` (resource `custom_attribute_definition`:
  entity, key, label, data_type, options, required, validation, visible_when, sort_order,
  is_active; `options` active only when data_type is a select kind (`when`), required then;
  key immutable after create (`write: 'create'`)), `src/modules/organization/preferences-page.ts`
  (user's own `user_settings`: locale, timezone via `timezone()`; only if org_admin can read/update
  its own row per metadata — else defer and log), `src/modules/organization/docs/custom_attribute_definition/index.en.md`
- Modify: `src/modules/organization/index.ts`, enums via `enumField` (entity, data type values from DB)
- Test: `tests/modules/custom-attributes.test.ts`

- [ ] **Step 1: Failing tests**: `options` inactive for `text`, active + required for select types;
  key not editable on edit; preferences page registered (or the deferral recorded).
- [ ] **Step 2–4:** FAIL → implement → PASS (unit + dev-stack + checkApp + docs-integrity).
- [ ] **Step 5: Commit** `feat(ui): custom attribute definitions and user preferences`.

### Task 4: Phase close

- [ ] `e2e/organization.spec.ts`: edit a setting and restore it; create, edit, delete a company;
  create a work schedule with an overnight window and see its summary; create a select attribute
  with options.
- [ ] Full gates (lint, typecheck, test, build, dev-stack tests, e2e), demo recording, `summary-01-organization.md`,
  gap log and roadmap updated, commit, push `feat/ui-console`.
