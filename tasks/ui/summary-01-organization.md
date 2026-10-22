# Summary — phase 1: Organization

Plan: `plan-01-organization.md`. Spec: `design.md`. Framework gaps: `buro-gaps.md`.
Branch `feat/ui-console`, commits `b491e26..` through the phase close. Demo video:
`playwright-output/phase-01-organization.webm` (settings, companies, a work schedule with an
overnight window, a select custom attribute, my preferences).

## What was built

All in `apps/admin-ui/`, on buro 0.6.0, using the phase 0 module pattern (one `ConsoleModule`, the
organization module grew).

- **Organization settings** (`organization/settings*.ts`, `organization-settings-view.tsx`): page
  "Settings" (`/organization-settings`) showing the current organization's `organization_settings`
  row in four panels (recognition, tracking, retention, access) plus a collapsed record panel; Edit
  opens the resource's edit route. The 4 policy counters are read-only. Checks warn on a very low or
  very high recognition threshold. Ranges mirror the DB CHECKs; columns without a CHECK use console
  limits listed in `SETTINGS_RANGES`.
- **Companies** (`organization/companies.ts`): full CRUD; list with search (name, contact email, cost
  center), kind/status filters and two saved views (tenants; contractors and vendors).
- **Work schedules** (`organization/work-schedules.ts`): full CRUD with the two new field types below;
  the list and show read "Mon–Fri 22:00–06:00 (overnight)" and "Europe/Moscow (UTC+03:00)".
- **Custom attribute definitions** (`organization/custom-attributes.ts`): entity and key fixed after
  create, data type editable (a changed select keeps its old options stored); select options appear only for the select type; reserved rules in a collapsed
  panel; sorted by entity and order.
- **My preferences** (`preferences-page.ts`, `preferences-view.tsx`, `user-settings.ts`): language
  and time zone of the signed-in user; an edit of the row, or a create when the user has none.
- **Articles** for company, work schedule, custom attribute definition and organization settings under
  `organization/docs/<scope>/`, field summaries on every non-obvious field.

## Reusable for later phases

- **`timezone({ required?, default?, texts? })`** (`src/fields/timezone*.ts`): searchable combobox over
  `Intl` zones with UTC offsets, an unknown stored zone shown flagged (never as UTC), display
  `Zone (UTC±hh:mm)`; Clear for an optional zone. Only listed IANA names, `UTC` and their aliases are
  accepted; offsets (`+03:00`, whose sign PostgreSQL reads the POSIX way) are refused. Phase 2 facilities and any `timezone` column.
- **`timeWindows({ emptyText, nullable?, texts? })`** (`src/fields/time-windows*.ts`, `time-window-row.tsx`):
  `emptyText` is required because an empty list means different things per column
  (`work_schedules.windows` `[]` = never on shift, `facilities.operating_hours` `[]` = always open);
  rows of weekday toggles plus `HH:MM` from/to (`24:00` allowed), overnight hint; `validateWindows`
  mirrors `itap.valid_windows` and `formatWindows` gives the compact text. Reuse for access
  policies, notification quiet hours, shifts.
- **`stringList({ item, ... })`** (`src/fields/string-list*.ts`): list of distinct non-blank strings
  with add/remove; display as badges. For any `text[]`/`jsonb` list of strings.
- **`boundedNumber({ min, max, integer })`** (`src/fields/bounded-number.ts`): `f.number` plus a
  `validate` naming the range, because the record form skips `min`/`max` (G14).
- **Translatable field refusals** (`src/fields/field-issue.ts`): reusable validators return
  `problemValidator(...)` issues with key `validation.itap.<field>.<reason>` and params (texts in
  `src/i18n/locales/en.ts`), not English literals that buro would show as its generic text in another
  locale. App-local validators (`checkKey`, `checkObject`, `checkLocale`, `checkEmail`) still return
  English strings (later i18n pass).
- **Settings current-record page pattern**: a custom page whose block renders `RecordScreen` for the
  record keyed by the identity (settings: `organization_id`, show; preferences: `user_id`, edit or
  create). Extends the phase 0 profile page (G13).
- **Enums**: `src/enums/organization.ts` (`company_kind`, `company_status`) through `enumField`.

## Rulings (from the ledger)

- `recognition_threshold` is a maximum distance: low means fewer matches. Both a low and a high
  warning stay, with accurate messages.
- Client ranges for columns without a DB CHECK were chosen by the implementer (0.1–0.9 thresholds
  etc.) and accepted; a too-tight range costs only a message.
- G14: a server CHECK refusal arrives as `forbidden`, so it cannot be mapped to its field; the form
  shows the generic alert, and the client range check is the real guard.
- Equal from/to in a time window is refused in the console although the DB accepts it
  (`itap.in_windows` never matches it); a stored one shows "Contains an invalid window".
- Company related lists (profiles, visits) are phase 4; deleting a referenced company is refused by
  the FK and the article says to set it inactive.

## Found by the smoke suite

Nothing broke. Two expectations were corrected while writing it: a new window defaults to Mon–Fri (the
summary reads "Mon–Fri", not "Daily"), and the seeded admin's `user_settings` row can hold no
language and no zone, so the preferences step records what is there and restores it exactly.

## Framework gaps met

G14 record form ignores a number's range and a server refusal never reaches a field; G15 the list
search box names only the first search field; G16 a current-record screen has no heading of its
own. Details and workarounds: `tasks/ui/buro-gaps.md`. G2/G3 are fixed upstream (unreleased):
upgrade buro when 0.6.x/0.7 lands.

## Deferred

- Company related lists (profiles, visits): phase 4.
- Minors from review: `default_retention_days` is unused but still required and ranged; the
  server-refusal test checks only the generic alert (G14); the time-windows input drops unknown keys
  of a stored window on edit; where `Intl.supportedValuesOf` is missing (old browsers) `isTimezone`
  only refuses offsets; field inputs ignore `presentation: 'plain'` (displays are already plain);
  app-local validator messages (`checkKey`, `checkObject`, `checkLocale`, `checkEmail`) are English
  literals; `timeWindows` `emptyText` and the string-list `item` noun are English texts in code; the
  preferences view casts the rows; a duplicate (entity, key) shows only the generic form alert;
  changing a select attribute to another type keeps its old options stored.
- Residual cross-tab race: a 401 that arrives before another tab's token refresh has been written to
  storage still signs this tab out.
- Carried from phase 0 and still open: bd `3v_mono-ryj` (P1, `profile_document` upload by
  `org_admin`) before phase 4; the phase 0 deferred minors.
- Dev runs leave audit rows (create and delete per run). The e2e removes every row it creates (a
  failed step is swept in `afterAll`); the settings and preferences steps restore their values.

## Gates (after the final-review fixes)

Unit/jsdom 178 passed (18 dev-stack skipped); with `ITAP_DEV_STACK=1` 195 passed (1 skipped); e2e 15
passed (auth, foundation, organization). Lint, typecheck and build clean.

## How to run

```bash
make dev-compose && pnpm seed                      # dev stack and demo data
pnpm --filter admin-ui dev                         # console on http://127.0.0.1:5173
pnpm --filter admin-ui lint && pnpm --filter admin-ui typecheck
pnpm --filter admin-ui test                        # unit/jsdom
ITAP_DEV_STACK=1 SEED_PASSWORD=... pnpm --filter admin-ui test       # + dev-stack tests
ITAP_DEV_STACK=1 SEED_PASSWORD=... pnpm --filter admin-ui test:e2e   # foundation + organization smoke
pnpm --filter admin-ui build
```

`SEED_PASSWORD` is in `apps/backend/.env`. hasura-auth allows 10 sign-ins per 5 minutes; each e2e spec
shares one session (about 2 sign-ins per spec including the organization setup), so a full e2e run
plus the dev-stack tests may need a five-minute pause between them.
