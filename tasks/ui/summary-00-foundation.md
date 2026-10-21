# Summary — phase 0: Foundation

Plan: `plan-00-foundation.md`. Spec: `design.md`. Framework gaps: `buro-gaps.md`.
Branch `feat/ui-console` (commits `465f0a3..` through the phase close). Demo video:
`playwright-output/phase-00-foundation.webm` (login, organization switch, dashboard, organization
profile with logo, member invitation with token, Help).

## What was built

The new ITAP console in `apps/admin-ui/`, on buro (`@burojs/*` 0.6.0, all pinned exactly): no Refine,
no codegen.

- **App skeleton** (`src/app/`): `app-definition.ts` registers the app's own sections, Help and enums
  plus one `use` per module of `src/modules/index.ts`; `nav.ts` (sections for every functional area +
  `NAV_ICONS`), `pages.ts`, `blocks.ts`, `runtime.tsx` (one runtime per mount via
  `createConsoleRuntime(auth.getToken)`, field implementations, block views), router adapter for
  react-router 7.
- **Auth** (`src/auth/`): `ItapAuthProvider` over Nhost sign-in plus the per-organization token from
  `switch_organization`; token store (localStorage `itap:auth:v1`), single-flight refresh, renewal that
  never overwrites a newer state, login page, organization picker, `RequireAuth`, `SessionWatch`
  (G10 workaround), identity retry on transient membership failures.
- **Shell**: organization switcher (clears cached data, re-issues the token), facility picker (scope per
  organization), command palette, user menu, Help page (`DocBrowser`).
- **Data** (`src/data/`): `provider.ts` (`createItapHasuraProvider` over the module registries),
  `mapping.ts` (`hasuraTable`, `selectFieldsOf`), `operations.ts` (`hasuraOperation`, `rootOf`),
  `schema.ts` (`schema(zod)`),
  `query-client.ts`, `endpoints.ts`; schema contract test against the live Hasura.
- **Enums** (`src/enums/`, `src/i18n/enums/`): tenancy and places enums, labels in the locale bundle;
  `enumField(values, ENUM_NAME, opts)` builds every enum field.
- **Fields**: `storageFile` field type (`src/fields/storage-file*.ts[x]`): upload to the org bucket with
  the org token, image preview through presigned URL, sensitive kinds through `open_file`.
- **i18n and docs**: `src/i18n/` registry (`createI18n`), `src/docs.ts` (`DocsConfig`, glossary
  `organization-token`), articles in `src/modules/<module>/docs/<scope>/`.
- **Modules**: overview (`dashboard_kpis` facts), organization (profile page, members read-only,
  invitations with `invite_member` flow, one-time token block, revoke), user (read-only over
  `auth.users`), facility (read, for the picker).

## Found by the smoke suite

The invite flow's Role select was empty: a flow field declared with `meta.enumNamespace` only does not
resolve the enum's options; the resource fields also set `ui.enum`. Unit and jsdom tests did not catch
it; the browser smoke did. Since the final review every enum field is built with `enumField` (both
keys), and `tests/enums/enum-fields.test.ts` fails on any registered enum field, flow form fields
included, whose `ui.enum` is missing or names no registered enum.

## Reusable for later phases

- **Module object** (`src/modules/<module>/index.ts`): each module exports one
  `ConsoleModule` (`src/modules/module.ts`): `{ name, uses, tables?, operations? }`. `name` is its
  contribution id, `uses` its resources, pages, blocks and custom operations, `tables` its Hasura
  mappings by binding (`hasuraTable(table, { selectFields: selectFieldsOf(fields) })`), `operations`
  its custom GraphQL documents. Add the module to `CONSOLE_MODULES` in `src/modules/index.ts`; the
  definition's `use` list, `ITAP_TABLES` and `HASURA_OPERATIONS` are folds over that list (a duplicate
  binding or operation throws at load). Block views go in the module's `views.ts`, listed in
  `src/modules/views.ts`. Modules never import `src/modules/index.ts`, `app-definition.ts` or
  `data/provider.ts` (`tests/modules/registry.test.ts`).
- **Custom operations**: declare `const xOperation = hasuraOperation(BINDING, 'name', { kind, document,
  variables, mapResult })` next to `defineQuery` / `defineMutation({ binding: xOperation.binding, … })`
  and list `xOperation` in the module's `operations`; validate with `schema(zod)`. The dev-stack schema
  test validates every document against the live schema as `org_admin`.
- **Mappings**: the schema contract test compares every `ITAP_TABLES` entry with live Hasura.
- **Enums**: `src/enums/<area>.ts` plus labels; build every enum field with
  `enumField(VALUES, ENUM_NAME, opts)` (`src/enums/field.ts`), never bare `f.enum`; enum tables are
  compared as `<table>_enum` types (not selectable by `org_admin`).
- **Articles**: `src/modules/<module>/docs/<scope>/<topic>.<locale>.md`, where `<scope>` is the
  registered resource the article is listed under (`parseArticlePath` in `src/docs.ts`); the
  docs-integrity test rejects other shapes, unreachable files and scopes naming no resource.
- **`storageFile` field**: `src/fields/implementations.ts` hands it to the runtime; requests take the
  token of the runtime's auth provider (`useStorageTarget`).
- **Dev-stack helpers**: `tests/support/dev-hosts.ts` (hosts, flags, seed constants shared by vitest
  and Playwright), `tests/support/dev-stack.ts` (`signInDev(email, orgName?)`), `e2e/dev-stack.ts`
  (`rememberOrganization`).
- **Profile-page pattern** (`organization/profile-page.ts` + `organization-profile-view.tsx`): a custom
  page rendering `RecordScreen` of the current record (G13).
- **Flow with one-time secret** (`invite-member.ts` + `invitation-token-block.ts`): `runFlow` tests,
  token block, `onUnknown` re-read.

## Final review fixes

Cross-tab session sync (`storage` events; `SessionWatch` follows another tab's sign-out, organization
switch or user change), prod frontend uses the app's `nginx.conf` (no mount over it), module objects
instead of hand-kept registries, module-owned articles, `enumField`, organization token expiry on the
client clock (JWT `exp - iat`, `NaN` refused), auth errors only for refused tokens (408/429/5xx are
transport), one token source (the `auth` prop builds the runtime and the storage target), operation
documents validated against the live schema, shared `tests/support/dev-hosts.ts`, clipboard guard.
Report: `.superpowers/sdd/plan-00-foundation/final-fix-report.md`.

## Decisions and rulings (from the ledger)

- `AUTH_BASE = '/auth/v1'` (hasura-auth serves under `/v1`, the proxy strips `/auth`); absolute base
  URLs in tests.
- Articles live under a resource scope (`organization_member`), because the handbook lists only resource
  and glossary scopes (G8); since the final review the scope is a folder inside the owning module
  (`modules/organization/docs/organization_member/`); the docs-integrity test rejects orphan scopes.
- `*` route stays inside the guarded shell. Revoke shipped because `org_admin` may update invitation
  status. Members are read-only. `readOnly` fields use `write: 'never'`.
- Single-flight refresh and stale-renewal guard added after review (rotating refresh tokens).
- Sensitive-kind security finding deferred as a data-layer task (below).
- buro maintainer info: G2 fixed upstream in PR #137, G3 in PR #139, both unreleased; keep workarounds
  thin and upgrade on the next release.

## Framework gaps met

G1 auth adapter and refresh; G2 `f.file` write path; G3 live socket token after switch; G4 no
`updateMany`/`deleteMany`; G5 read-only links; G6 context slices; G7 per-browser saved views; G8
handbook scopes; G9 badge colours; G10 `useList` never runs auth recovery; G11 flow form ignores field
format; G12 `onUnknown.check` blind to input; G13 no current-record screen. Details, workarounds and
evidence: `tasks/ui/buro-gaps.md`.

## Deferred

Data layer: **bd `3v_mono-ryj` (P1)**: `org_admin` can upload `kind = profile_document` (sensitive) into
the org bucket; fix before phase 4 (people/documents).

Deferred minors from review (none blocks phase 1):
- Docs/build: weak assertions on `docs.concepts`/`fallbackLocale`; `docs.ts` builds a second locale
  registry at load; "ITAP Console" literal in `app.tsx`/`index.html`.
- Auth: integration test asserts `login` toBeDefined, not success; token-store write-failure fallback reads
  stale storage; login writes base and org separately; `onError` without org does not clear the store;
  concurrent `switchOrganization` is last-response-wins; renewal failure after a newer switch may
  sign out; `SessionWatch` rotates outside `serializeLifecycle`; `check()` does a network refresh per generation (needs a comment); identity error state appears only
  after query retries.
- Data: schema test honours `aggregate:false` but not `noAggregate:true`.
- Shell: org switch rotates then replaces scope (old facility briefly in scope; phase 2); e2e no-loop
  check uses `waitForTimeout`.
- Invitations: role default `admin`; `operations.dev` test
  leaks a pending invitation if its assertion fails; no test for token copy or the invalid-email
  message.
- Files: non-image link may hold an expired presigned URL; `open_file` `window.open` after async may be
  blocked; uploads before Save orphan files in `org-logos`; identity memberships `logoFileId` stale
  after a logo change.
- The e2e invite step leaves one pending `e2e-<timestamp>@itap.test` invitation per run (revoke from the
  Invitations list; `seed --reset` clears them).
- Logos stay in `org-logos` (org_admin cannot delete there): each dev run and each logo replacement
  leaves one small file.

## How to run

```bash
make dev-compose                                   # dev stack (Hasura :8080, auth :4100, backend)
pnpm seed                                          # demo organizations, user admin@itap.demo
pnpm --filter admin-ui dev                         # console on http://127.0.0.1:5173
pnpm --filter admin-ui lint && pnpm --filter admin-ui typecheck
pnpm --filter admin-ui test                        # unit/jsdom (dev-stack files skipped)
ITAP_DEV_STACK=1 SEED_PASSWORD=... pnpm --filter admin-ui test   # + dev-stack tests
ITAP_DEV_STACK=1 SEED_PASSWORD=... pnpm --filter admin-ui test:e2e   # Playwright (starts Vite itself)
pnpm --filter admin-ui build
```

`SEED_PASSWORD` is in `apps/backend/.env`. The dev auth service allows 10 sign-ins per 5 minutes and
keeps counting while it is refused: the e2e specs share one session each (about 6 sign-ins per full
run); after a 429 wait five quiet minutes.

## What phase 1 reuses

One `ConsoleModule` per module (`src/modules/<module>/index.ts`, listed in `src/modules/index.ts`)
carrying its uses, table mappings and operation documents; operations declared with `hasuraOperation`
beside their `defineQuery` / `defineMutation`; the schema contract test (tables, enums, operation
documents against the live schema); `enumField` for every enum field (guarded by
`tests/enums/enum-fields.test.ts`); the `RecordScreen` profile pattern (organization settings, user
settings); the `storageFile` field; articles in `src/modules/<module>/docs/<scope>/` with
`docs-integrity` and `checkApp` as the gate; `signInDev`, `tests/support/dev-hosts.ts` and the e2e
session pattern (one smoke per module).
