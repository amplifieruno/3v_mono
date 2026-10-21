# Summary — phase 0: Foundation

Plan: `plan-00-foundation.md`. Spec: `design.md`. Framework gaps: `buro-gaps.md`.
Branch `feat/ui-console` (commits `465f0a3..` through the phase close). Demo video:
`playwright-output/phase-00-foundation.webm` (login, organization switch, dashboard, organization
profile with logo, member invitation with token, Help).

## What was built

The new ITAP console in `apps/admin-ui/`, on buro (`@burojs/*` 0.6.0, all pinned exactly): no Refine,
no codegen.

- **App skeleton** (`src/app/`): one `use()` list in `app-definition.ts`; `nav.ts` (sections for every
  functional area + `NAV_ICONS`), `pages.ts`, `blocks.ts`, `runtime.tsx` (`createRuntime`, field
  implementations, block views), router adapter for react-router 7.
- **Auth** (`src/auth/`): `ItapAuthProvider` over Nhost sign-in plus the per-organization token from
  `switch_organization`; token store (localStorage `itap:auth:v1`), single-flight refresh, renewal that
  never overwrites a newer state, login page, organization picker, `RequireAuth`, `SessionWatch`
  (G10 workaround), identity retry on transient membership failures.
- **Shell**: organization switcher (clears cached data, re-issues the token), facility picker (scope per
  organization), command palette, user menu, Help page (`DocBrowser`).
- **Data** (`src/data/`): `provider.ts` (`createItapHasuraProvider`), `mapping.ts` (Hasura mapping
  helper), `operations.ts` (closed custom-operation registry), `schema.ts` (`schema(zod)`),
  `query-client.ts`, `endpoints.ts`; schema contract test against the live Hasura.
- **Enums** (`src/enums/`, `src/i18n/enums/`): tenancy and places enums, labels in the locale bundle.
- **Fields**: `storageFile` field type (`src/fields/storage-file*.ts[x]`): upload to the org bucket with
  the org token, image preview through presigned URL, sensitive kinds through `open_file`.
- **i18n and docs**: `src/i18n/` registry (`createI18n`), `src/docs.ts` (`DocsConfig`, glossary
  `organization-token`), articles in `src/modules/<scope>/docs/`.
- **Modules**: overview (`dashboard_kpis` facts), organization (profile page, members read-only,
  invitations with `invite_member` flow, one-time token block, revoke), user (read-only over
  `auth.users`), facility (read, for the picker).

## Found by the smoke suite

The invite flow's Role select was empty: a flow field declared with `meta.enumNamespace` only does not
resolve the enum's options; the resource fields also set `ui.enum`. Fixed in `invitations.ts` (same
pattern as `roleField`). Unit and jsdom tests did not catch it; the browser smoke did. Later phases:
set `ui.enum` on every enum field, flow fields included.

## Reusable for later phases

- **Mapping helper** (`src/data/mapping.ts`): one place per module registers table, roots and
  aggregate flags; the schema contract test compares every resource with live Hasura.
- **Operations registry + `schema()`**: add a document to `HASURA_OPERATIONS[binding][operation]`, bind
  with `defineQuery` / `defineMutation({ binding })`, validate with `schema(zod)`.
- **Enums**: `src/enums/<area>.ts` plus labels; enum tables are compared as `<table>_enum` types (not
  selectable by `org_admin`).
- **`storageFile` field**: `src/fields/implementations.ts` hands it to the runtime.
- **Dev-stack helpers**: `tests/support/dev-stack.ts` (`signInDev(email, orgName?)`) for vitest dev
  tests; `e2e/dev-stack.ts` (`rememberOrganization`, seed constants) for Playwright.
- **Profile-page pattern** (`organization/profile-page.ts` + `organization-profile-view.tsx`): a custom
  page rendering `RecordScreen` of the current record (G13).
- **Flow with one-time secret** (`invite-member.ts` + `invitation-token-block.ts`): `runFlow` tests,
  token block, `onUnknown` re-read.

## Decisions and rulings (from the ledger)

- `AUTH_BASE = '/auth/v1'` (hasura-auth serves under `/v1`, the proxy strips `/auth`); absolute base
  URLs in tests.
- Articles live under a resource scope (`organization_member`), because the handbook lists only resource
  and glossary scopes (G8); the docs-integrity test rejects orphan scopes.
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
  registry at load; "ITAP Console" literal in `app.tsx`/`index.html`; check whether the prod compose
  mounts its own `nginx.conf`.
- Auth: integration test asserts `login` toBeDefined, not success; org `expiresAt` from server clock,
  unvalidated; coarse error mapping (refresh 429 -> logout); token-store write-failure fallback reads
  stale storage; login writes base and org separately; `onError` without org does not clear the store;
  concurrent `switchOrganization` is last-response-wins; renewal failure after a newer switch may
  sign out; `SessionWatch` rotates outside `serializeLifecycle`; `check()` does a network refresh per generation (needs a comment); identity error state appears only
  after query retries.
- Data: schema test honours `aggregate:false` but not `noAggregate:true`; `mapping.ts` imports module
  resources (cycle risk as modules grow, consider per-module registration).
- Shell: org switch rotates then replaces scope (old facility briefly in scope; phase 2); e2e no-loop
  check uses `waitForTimeout`.
- Invitations: clipboard `writeText` has no catch/feedback; role default `admin`; `operations.dev` test
  leaks a pending invitation if its assertion fails; no test for token copy or the invalid-email
  message.
- Files: non-image link may hold an expired presigned URL; `open_file` `window.open` after async may be
  blocked; uploads before Save orphan files in `org-logos`; identity memberships `logoFileId` stale
  after a logo change; comment references `storage-file-impl.tsx`.
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

The mapping registry and schema contract test (each new resource is a mapping entry), the operations
registry, `RecordScreen` profile pattern (organization settings, user settings), enums, the
`storageFile` field, `signInDev` and the e2e session pattern (one smoke per module), articles under
resource scopes with `docs-integrity` and `checkApp` as the gate.
