# ITAP Console Phase 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `apps/admin-ui` on buro 0.6.0 where an operator signs in through Nhost, works inside
an organization token that renews itself, switches organization and facility, sees a dashboard fed by
a SQL function, edits the organization profile (with a logo upload), manages members and invitations
(an action through a flow), and reads in-app documentation — with the plumbing every later phase
reuses.

**Architecture:** Vite SPA. `@burojs/core` declarations (resources, pages, blocks, flows, custom
operations) registered in one `defineAppDefinition`; `@burojs/hasura` provider over the dev Hasura
using the organization token; an app-owned `AuthProvider` for Nhost + `switch_organization`;
`@burojs/ui-shadcn` `AppShell`; locale registry with `en` primary and docs bundles.

**Tech Stack:** React 19, Vite, react-router 7, Tailwind v4, `@burojs/*` 0.6.0 (exact), zod 3,
`@tanstack/react-query` (buro's version), i18next, vitest + jsdom, Playwright.

**Spec:** `tasks/ui/design.md` (with `tasks/ui/roadmap.md`, `tasks/ui/buro-gaps.md`).

## Global Constraints

- All `@burojs/*` packages pinned to exactly `0.6.0`; never `^`. Peers installed explicitly:
  `tailwindcss@^4`, `i18next`, `zod@^3.24`, `@tanstack/react-query` at the version `@burojs/react`
  depends on.
- Framework reference while coding: the installed `node_modules/@burojs/*` (types and dist) and the
  0.6.0 source + guides + example at
  `/tmp/claude-1000/-home-dev-Projects-3v-3v-mono/64fcaaa1-ca39-4e04-8100-bc49844caa6b/scratchpad/buro-main/`
  (`docs/`, `packages/*/src`, `examples/marketplace-ops/src`). Current code wins over guides.
  Study notes in `.../scratchpad/buro-notes/` predate 0.6.0 many-to-many and read scope.
- Every text in code is English and lives in `texts` (flat `label`/`title`/`message` are refused by
  buro). No inline locale maps.
- No `any`; no `console.log`; files about 300 lines or less; named exports (page/block views may be
  default exports for lazy loading); lucide icon names (`registerIcons` for extras).
- No second data client: no Apollo/urql/graphql-request; GraphQL goes through `@burojs/hasura`
  (resources and the closed operations registry). The auth module's own `fetch` calls to Nhost auth
  and to `switch_organization` (role `user`, before any org token exists) are the only exception.
- The console never uses the Hasura admin secret.
- Dev endpoints through the Vite proxy: `/v1/graphql` → `http://localhost:8080` (ws), `/auth` →
  `http://localhost:4100` (prefix stripped), `/storage` → `http://local.storage.local.nhost.run`
  (prefix stripped), `/socket.io` → `http://localhost:3001` (ws).
- Seed accounts: `admin@itap.demo` (member of Nova Tower and Riverside), `nova.admin@itap.demo`;
  password from `SEED_PASSWORD` (same env the backend seed uses). Tests that need the dev stack read
  `SEED_PASSWORD` and are skipped when `ITAP_DEV_STACK` is not `1`.
- vitest is always `vitest run`, never watch. Playwright runs against the dev stack and the seed.
- Every resource gets `texts.label/labelPlural` and `texts.doc.summary`; every field whose label does
  not carry its meaning gets `texts.doc.summary` (codes, statuses, system-written values, relations).
- Any framework gap met is appended to `tasks/ui/buro-gaps.md` in the same commit.
- Commits: `<type>(ui): …`, body ends with
  `Claude-Session: https://claude.ai/code/session_012M8dWgJ8czzgu4Xxo5CxX4` and
  `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`. Push only `feat/ui-console`.

## Review Focus

1. The organization token (15 min) expires while the user works: the next request renews it
   transparently (no sign-out, no lost form). — Task 2 test `renews an org token that is about to expire`.
2. Many requests fail or start at once around expiry: exactly one renewal runs, all requests then use
   the new token. — Task 2 test `single-flights concurrent renewals`.
3. The refresh token is invalid/expired: the user lands on the login page with the store cleared, no
   redirect loop. — Task 2 test `signs out when the refresh token is rejected`; Task 4 e2e.
4. An organization switch is refused (membership inactive, org suspended): the user stays in the
   current organization, sees the server's message, and the switcher shows the current org. — Task 2
   test `keeps the current organization when a switch is refused`; Task 4 test.
5. A user with several organizations and no remembered one, or with none active, is not dropped
   into an empty shell: picker or explanation. — Task 2 test `leaves the organization unset when the
   choice is ambiguous`; Task 4 route test.

---

### Task 1: New app skeleton, tooling, i18n/docs plumbing, CLAUDE.md

Replace the old Refine app in place with an empty buro app that builds, lints, typechecks, mounts,
and passes `checkApp` and the docs-integrity test.

**Files:**
- Delete: `apps/admin-ui/src/**`, `apps/admin-ui/codegen.ts`, `apps/admin-ui/components.json`,
  `apps/admin-ui/graphql.schema.json` (if present), `apps/admin-ui/README.MD`, `apps/admin-ui/dist`
- Rewrite: `apps/admin-ui/package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`,
  `eslint.config.js`, `index.html`, `Dockerfile` (build = `vite build`), `nginx.conf` (SPA fallback kept)
- Create: `apps/admin-ui/vitest.config.ts`, `src/main.tsx`, `src/styles.css`, `src/vite-env.d.ts`,
  `src/app/app-definition.ts`, `src/app/nav.ts` (sections + `NAV_ICONS`), `src/app/pages.ts`
  (dashboard + help pages), `src/app/blocks.ts`, `src/app/help-page.tsx`,
  `src/i18n/registry.ts`, `src/i18n/create-i18n.ts`, `src/i18n/locales/en.ts`,
  `src/i18n/resources/en.ts`, `src/i18n/enums/en.ts`, `src/docs.ts`, `README.md`,
  `tests/check-app.test.ts`, `tests/docs-integrity.test.ts`
- Modify: `CLAUDE.md` (sections "Frontend (`apps/admin-ui/`)", "Frontend Patterns", the
  `pnpm gql` lines under Data Layer commands, "Verification with Playwright" stays)

**Interfaces:**
- Produces: `definition` and `app` (`src/app/app-definition.ts`); `NAV_SECTIONS` =
  `{ overview, organization, places, devices, people, monitoring, notifications, analytics, access, compliance }`
  as section names with `defineSection` declarations (only `overview` and `organization` used in
  this phase); `buildLocaleRegistry(): LocaleRegistry` (`src/i18n/registry.ts`);
  `createI18n(registry, stored?)` and `LANGUAGE_STORAGE_KEY = 'itap:language'`
  (`src/i18n/create-i18n.ts`); `docs: DocsConfig` (`src/docs.ts`) with article glob
  `./modules/*/docs/*.md` and `concepts` list; pages `dashboard` (`/dashboard`, order 0) and
  `help` (`/help`, last) — the dashboard body is an empty block until Task 5.
- Scripts in `apps/admin-ui/package.json`: `dev`, `build` (`tsc -b && vite build`), `preview`,
  `lint` (`eslint .`), `typecheck` (`tsc -b --noEmit` or equivalent), `test` (`vitest run`),
  `test:e2e` (`playwright test`).

- [ ] **Step 1: Remove the old app and write the new package manifest, configs and boot files** as
  listed; `src/styles.css` starts with `@import "@burojs/ui-shadcn/styles.css";`; `index.html` carries
  buro's pre-paint theme script (key `buro-theme`); `main.tsx` renders a placeholder `<App/>` that
  only mounts `BuroProvider`-free markup until Task 4.
- [ ] **Step 2: Write `tests/check-app.test.ts`**
  ```ts
  it('reports no diagnostics', async () => {
    await app.ready;
    const reported = await checkApp(app, { i18n: buildLocaleRegistry() });
    expect(reported).toEqual([]);
  });
  it('registers the dashboard and help pages', () => {
    expect([...app.registry.customPages.keys()]).toEqual(expect.arrayContaining(['dashboard', 'help']));
  });
  ```
- [ ] **Step 3: Write `tests/docs-integrity.test.ts`** (pattern: marketplace-ops
  `tests/docs-integrity.test.ts`): fails on a documented resource/field/node that is not registered,
  an empty `doc`, a summary equal to its label, a `.md` file not reachable from `docs.sources`, a
  `doc.see` naming an unlisted concept, a listed concept without a summary.
- [ ] **Step 4: Implement app definition, nav, pages, help page block (`DocBrowser`), locale
  registry (framework `en` + app `common`/`enums`/`resources` globs), docs config, and one concept
  (`organization-token`) so the tests pass.**
- [ ] **Step 5: Run** `pnpm --filter admin-ui install && pnpm --filter admin-ui test && pnpm --filter admin-ui lint && pnpm --filter admin-ui typecheck && pnpm --filter admin-ui build`
  Expected: all pass; `dist/` built.
- [ ] **Step 6: Rewrite the CLAUDE.md frontend sections** for buro (packages, where resources live,
  `texts`/docs rules, gap log, no Refine/codegen); keep every other section.
- [ ] **Step 7: Commit** `feat(ui): buro app skeleton replaces the Refine admin-ui`.

### Task 2: Auth core — token store, Nhost client, organization tokens, AuthProvider

Pure TypeScript (no React), fully unit-tested with a fake `fetch`; one dev-stack integration test.

**Files:**
- Create: `src/auth/types.ts`, `src/auth/token-store.ts`, `src/auth/nhost-client.ts`,
  `src/auth/org-client.ts`, `src/auth/auth-provider.ts`, `src/auth/index.ts`
- Test: `tests/auth/token-store.test.ts`, `tests/auth/auth-provider.test.ts`,
  `tests/integration/auth.dev.test.ts`

**Interfaces:**
- Produces (`src/auth/types.ts`):
  ```ts
  interface BaseSession { accessToken: string; refreshToken: string; expiresAt: number; user: { id: string; email: string; displayName: string } }
  interface OrgSession { accessToken: string; expiresAt: number; organizationId: string; role: string }
  interface Membership { organizationId: string; name: string; logoFileId: string | null; role: string; status: string }
  interface ItapIdentity { id: string; email: string; name: string; roles: readonly string[]; organizationId: string | null; memberships: readonly Membership[] }
  type LoginParams = { email: string; password: string; organizationId?: string }
  ```
- `createTokenStore(storage?: Storage): TokenStore` — `snapshot(): { base: BaseSession | null; org: OrgSession | null }`,
  `setBase(s)`, `setOrg(s)`, `clear()`, `subscribe(listener): () => void`; persists to
  `localStorage` key `itap:auth:v1`; a corrupt stored value reads as signed out.
- `createNhostClient({ baseUrl }): NhostClient` — `signIn(email, password): Promise<BaseSession>`
  (`POST {baseUrl}/signin/email-password`), `refresh(refreshToken): Promise<BaseSession>`
  (`POST {baseUrl}/token`), `signOut(refreshToken): Promise<void>` (`POST {baseUrl}/signout`).
- `createOrgClient({ endpoint }): OrgClient` — `memberships(baseToken): Promise<{ memberships: Membership[]; lastOrganizationId: string | null }>`
  and `switchOrganization(baseToken, organizationId): Promise<OrgSession>`; GraphQL over `fetch`
  with `x-hasura-role: user`; a GraphQL error becomes `DataError { kind: 'forbidden' | 'auth', code, message }`
  carrying the action's error code (`not_a_member`, `membership_inactive`, `organization_suspended`, …).
- `createItapAuthProvider({ store, nhost, org, now?, renewBeforeMs = 60_000 }): ItapAuthProvider`
  where `ItapAuthProvider = AuthProvider<ItapIdentity> & { getToken(): Promise<string | null>; switchOrganization(id: string): Promise<AuthResult> }`.
  `login` signs in, loads memberships, then switches to `params.organizationId ?? lastOrganizationId`
  if it is an active membership, else to the only active membership, else leaves the org unset.
  `getToken` returns the org token, renewing it first (base refresh if needed, then
  `switch_organization`) when it expires within `renewBeforeMs`; renewal is single-flight.
  `onError(e)` → `kind === 'auth'`: renew → `{ action: 'refreshed' }`, failure → clear store,
  `{ action: 'logout' }`; other kinds → `{ action: 'propagate', error: e }`.
  `switchOrganization` failure returns `{ success: false, error }` and leaves the store untouched.

- [ ] **Step 1: Write the failing tests** in `tests/auth/auth-provider.test.ts` with a scripted fake
  `fetch` and an injectable clock: `logs in and switches to the last organization`, `logs in to the
  only active membership`, `leaves the organization unset when the choice is ambiguous`, `renews an
  org token that is about to expire` (clock 30 s before expiry → one `switch_organization` call, new
  token returned), `single-flights concurrent renewals` (5 parallel `getToken()` → 1 switch call, all
  get the same token), `refreshes the base token before re-switching when it expired`, `signs out when
  the refresh token is rejected` (store cleared, `onError` → `logout`), `keeps the current
  organization when a switch is refused` (`membership_inactive` → `success: false`, store unchanged,
  error message preserved), `propagates non-auth errors`. `tests/auth/token-store.test.ts`: round
  trip, subscribe/unsubscribe, corrupt storage reads as signed out.
- [ ] **Step 2: Run** `pnpm --filter admin-ui test -- tests/auth` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement the five modules.**
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Write `tests/integration/auth.dev.test.ts`** (skipped unless `ITAP_DEV_STACK=1`):
  signs in `admin@itap.demo` against `http://localhost:4100` and `http://localhost:8080/v1/graphql`,
  sees two memberships, switches to each, and a Hasura query `organizations { id }` with each org
  token returns exactly that organization. Run with `ITAP_DEV_STACK=1 SEED_PASSWORD=… pnpm --filter admin-ui test -- tests/integration/auth`
  — Expected: PASS. (The test may call the services directly instead of through the Vite proxy.)
- [ ] **Step 6: Commit** `feat(ui): Nhost sign-in and self-renewing organization tokens`.

### Task 3: Hasura mapping, custom-operation plumbing, enums, schema-mapping test

**Files:**
- Create: `src/data/endpoints.ts` (`GRAPHQL_ENDPOINT = '/v1/graphql'`, `AUTH_BASE = '/auth'`,
  `STORAGE_BASE = '/storage'`), `src/data/mapping.ts`, `src/data/provider.ts`, `src/data/schema.ts`,
  `src/data/operations.ts` (registry object, initially empty map), `src/data/query-client.ts`,
  `src/enums/tenancy.ts`, `src/modules/organization/organization.ts`,
  `src/modules/places/facility.ts` (minimal facility resource for the picker: `name`, `code`,
  `timezone`, `status`; read-only in this phase)
- Test: `tests/data/mapping.test.ts`, `tests/integration/schema-mapping.dev.test.ts`

**Interfaces:**
- `hasuraTable(table: string, opts?: Partial<HasuraResourceMapping>): HasuraResourceMapping` —
  defaults `pkType: 'uuid'`, `pkField: 'id'`, `orderByField: 'created_at'`.
- `ITAP_TABLES: Record<string, HasuraResourceMapping>` — keyed by buro resource data binding; each
  module adds its entries; `selectFields` derived from the resource's declared field names via
  `selectFieldsOf(resource)` (dotted/link fields excluded).
- `createItapHasuraProvider(getToken: () => Promise<string | null>)` — `@burojs/hasura` provider with
  `endpoint: GRAPHQL_ENDPOINT`, `defaultRole: null`, `resources: ITAP_TABLES`,
  `operations: HASURA_OPERATIONS`.
- `schema<T>(zodType): TrustedSchema<T>` — the Standard Schema adapter (copy marketplace-ops
  `src/data/operations.ts` helper).
- `createItapQueryClient()` — no retry for `capability | validation | forbidden | not-found |
  cancelled | configuration` and 4xx except 429.
- Enums (`defineEnum`) with colours: `organization_status` (active=success, suspended=warning),
  `member_role` (admin), `member_status`, `invitation_status` (pending=info, accepted=success,
  revoked=neutral, expired=caution), `facility_status`. Values exactly as the Hasura enum tables hold
  them (read them from the dev database, not from memory).
- Resources: `organization` (table `organizations`: name, slug, legal_name, logo_file_id, timezone,
  locale, status; `operations: { create: false, delete: false }`; `views.list.page: false`);
  `facility` (table `facilities`, read-only here).

- [ ] **Step 1: Write `tests/data/mapping.test.ts`**: `hasuraTable` defaults; `selectFieldsOf` returns
  declared scalar field names and excludes link fields; every `ITAP_TABLES` entry has `pkType: 'uuid'`.
- [ ] **Step 2: Write `tests/integration/schema-mapping.dev.test.ts`** (dev stack): signs in through
  Task 2's clients, introspects as `org_admin`, and for every `ITAP_TABLES` entry asserts: root
  `<table>` and `<table>_by_pk(id: uuid!)` exist, `<table>_aggregate` exists unless `aggregate: false`,
  every `selectFields` entry is a field of the type, `orderByField` is a field. For every registered
  enum asserts its values equal the rows of the Hasura enum table.
- [ ] **Step 3: Run both** — Expected: FAIL.
- [ ] **Step 4: Implement** the files above; register `organization`, `facility` and the enums in
  `app-definition.ts`; document both resources and their non-obvious fields.
- [ ] **Step 5: Run** unit + dev-stack tests, `checkApp`, docs-integrity — Expected: PASS.
- [ ] **Step 6: Commit** `feat(ui): Hasura mapping, enums and schema contract test`.

### Task 4: Runtime, shell, routes, organization and facility switching

**Files:**
- Create: `src/app/runtime.tsx` (`AppRuntime`: awaits `app.ready`, builds resolver, i18n, query
  client, data session, data runtime; disposes on unmount), `src/app/app.tsx` (router, router
  adapter, link component, routes), `src/app/router-adapter.tsx`, `src/app/identity-sync.tsx`,
  `src/app/organization-switcher.tsx`, `src/app/facility-picker.tsx`, `src/app/scope.ts`,
  `src/auth/login-page.tsx`, `src/auth/organization-picker-page.tsx`, `src/auth/require-auth.tsx`,
  `src/auth/session.ts` (module singletons: `tokenStore`, `authProvider`)
- Test: `tests/app/scope.test.ts`, `tests/app/routes.test.tsx`, `e2e/playwright.config.ts`,
  `e2e/auth.spec.ts`

**Interfaces:**
- `applyFacility(deps: { dataSession: DataSession; resolver: Resolver }, organizationId: string, facilityId: string | null): Promise<void>`
  — `dataSession.replaceScope({ facility: facilityId })` and `resolver.setSlice('scope', { organization: organizationId, facility: facilityId })`;
  stored per organization in `localStorage` key `itap:facility:<organizationId>`.
- `performOrganizationSwitch(auth: ItapAuthProvider, dataSession: DataSession, organizationId: string): Promise<AuthResult>`
  — on success `dataSession.rotateSession()`; on failure returns the result (caller toasts
  `error.message` and keeps the switcher on the current org).
- Resolver slices: `user` ({ id, roles }), `permissions` (`createReadyPermissions` allowing
  everything for `org_admin`), `scope` ({ organization, facility }).
- Routes: `/login` (`AuthPage` + login form, outside the shell), `/organizations` (picker, signed-in
  without org), every `generateRouteDescriptors(app)` route inside `RequireAuth` (signed in **and**
  organization set, else redirect to `/organizations`), `/` → `/dashboard`, `*` → `NavAreaPage`.
- Shell: `AppShell` brand "ITAP", sidebar header = organization `ScopeSwitcher` (memberships),
  sidebar filters = facility `ContextPicker` (facilities list, "All facilities" = null), `DocPanel`,
  `Toaster`, `presentationHosts={shadcnPresentationHosts}`, `components={{ ...defaultNavLayouts }}`.

- [ ] **Step 1: Write the failing tests**: `tests/app/scope.test.ts` — `applyFacility` sets both
  the data scope and the resolver slice and persists per organization; `performOrganizationSwitch`
  rotates the session only on success and returns the refusal unchanged.
  `tests/app/routes.test.tsx` (jsdom) — signed-out → `/login`; signed in without organization →
  `/organizations`; user with zero active memberships sees the explanation text, not a blank shell.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the files.
- [ ] **Step 4: Write `e2e/auth.spec.ts`** (Playwright, dev stack + `pnpm dev`): sign in as
  `admin@itap.demo` → dashboard in Nova Tower; switch to Riverside → sidebar shows Riverside and the
  facility picker lists Riverside facilities; sign out → `/login`; a stale refresh token in storage
  → `/login` without a loop.
- [ ] **Step 5: Run** vitest + `pnpm --filter admin-ui test:e2e -- e2e/auth.spec.ts` — Expected: PASS.
- [ ] **Step 6: Commit** `feat(ui): app runtime, shell, organization and facility switching`.

### Task 5: Custom operations — dashboard KPIs (SQL function) and invitations (Hasura action flow)

**Files:**
- Create: `src/modules/overview/kpis.ts` (`dashboardKpis = defineQuery(...)` over tracked function
  `dashboard_kpis`; read its arguments and result type by introspection), `src/modules/overview/dashboard.ts`
  (dashboard page body: `facts` placement with labelled `fields`),
  `src/modules/organization/members.ts` (resource `organization_member`, table
  `organization_members`: user (display name/email via relationship as dotted columns if the role can
  read them, else user id), role, status, title, department, joined_at, expires_at),
  `src/modules/organization/invitations.ts` (resource `organization_invitation`: email, role, status,
  expires_at, invited_by; resource flow `invite` submitting `inviteMember = defineMutation(...)` over
  action `invite_member(email, role)`, effects `[{ resource: 'organization_invitation' }]`,
  `then.open` a block `itap:invitation-token` showing the one-time token with a copy button;
  item flow `revoke` if the data layer offers revocation — check; otherwise omit and log nothing),
  `src/modules/organization/invitation-token-block.tsx`, `src/modules/organization/docs/members.en.md`
- Modify: `src/data/operations.ts` (documents for `dashboard_kpis` and `invite_member`),
  `src/app/app-definition.ts`, `src/app/pages.ts`
- Test: `tests/modules/invite-flow.test.ts` (`runFlow`), `tests/integration/operations.dev.test.ts`

**Interfaces:**
- `HASURA_OPERATIONS` gains `overview.dashboardKpis` and `organization_invitation.inviteMember`
  entries (`{ kind, document, variables, mapResult }`).
- `invitationTokenBlock = defineBlock('itap:invitation-token', { props: { token: prop(z.string()), expiresAt: prop(z.string()) } })`.

- [ ] **Step 1: Write the failing tests**: `invite-flow.test.ts` with `runFlow` — filling email and
  role submits `inviteMember` with `{ email, role }` and the outcome is success; an invalid email is
  refused before submit. `operations.dev.test.ts` (dev stack) — `dashboardKpis` through the provider
  returns numbers for Nova Tower; `inviteMember` creates a pending invitation visible through the
  `organization_invitation` resource.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**; document both resources, their status fields and the invite flow
  (`texts.doc`); article `members.en.md` (who can sign in, what an invitation is, its lifecycle as a
  mermaid diagram).
- [ ] **Step 4: Run** unit + dev-stack tests, `checkApp`, docs-integrity — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): dashboard KPIs and member invitations through custom operations`.

### Task 6: File field (upload, display, sensitive open) and the organization profile screen

**Files:**
- Create: `src/fields/storage-file.ts` (declaration: `storageFile(opts: { bucket: 'organization' | 'org-logos'; kind: string; accept?: string; maxSize?: number; sensitive?: boolean; texts?: FieldTexts })`
  → a `uuid` string field with `ui: { input: 'itap.storage-file', display: 'itap.storage-file' }` and
  `meta: { bucket, kind, sensitive }`), `src/fields/storage-file-impl.tsx` (`fieldImplementation`
  with `meta` schema; Input uploads with `POST {STORAGE_BASE}/v1/files` multipart `file[]`,
  `bucket-id` (= organization id for `organization`, `org-logos` otherwise) and `metadata[]` carrying
  `{ kind }`, then writes the returned file id; Display shows an image preview for images via the
  storage presigned URL, otherwise a link; `sensitive` opens through `openFile = defineMutation` over
  action `open_file`), `src/fields/implementations.ts` (`composeFieldImplementations(shadcnFieldImplementations, …)`),
  `src/modules/organization/profile-page.ts` (custom page `organization-profile`, nav "Organization",
  body block `itap:organization-profile` rendering `RecordScreen` for the current organization id)
- Modify: `organization.ts` (`logo_file_id: storageFile({ bucket: 'org-logos', kind: 'logo', accept: 'image/*' })`;
  show/edit layout with panels), `src/data/operations.ts` (`open_file`), `app-definition.ts`,
  `runtime.tsx` (`fieldImplementations`)
- Test: `tests/fields/storage-file.test.tsx`, `tests/integration/files.dev.test.ts`

**Interfaces:**
- `storageFile(...)` (above); field implementation id `itap.storage-file`.
- `useStorageUpload(): (file: File, meta: { bucket: string; kind: string }) => Promise<{ id: string }>`
  — reads the org token through `authProvider.getToken()`.

- [ ] **Step 1: Write the failing tests** (`storage-file.test.tsx`, jsdom, fake `fetch`): picking a
  file posts multipart with `bucket-id` and `kind` metadata and sets the field value to the returned
  id; a 403/4xx from storage shows the error under the field and keeps the previous value; display
  of a sensitive file calls `open_file` instead of the presign endpoint.
  `files.dev.test.ts` (dev stack): upload a PNG as `org-logos`/`logo`, update
  `organizations.logo_file_id`, read the presigned URL and fetch it (200).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**; append to `buro-gaps.md`: G2 confirmed or refuted with what was run
  (evidence `[run]`), and G8 "no singleton/current-record resource kind" if the profile page needed
  the custom block.
- [ ] **Step 4: Run** unit + dev-stack tests, `checkApp`, docs-integrity — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): storage file field and organization profile`.

### Task 7: Phase close — smoke suite, demo, summary, gates, push

**Files:**
- Create: `apps/admin-ui/e2e/foundation.spec.ts`, `tasks/ui/summary-00-foundation.md`
- Modify: `tasks/ui/buro-gaps.md` (every gap met in this phase, evidence upgraded to `[run]` where
  run), `tasks/ui/roadmap.md` (phase 0 done)

- [ ] **Step 1: Write `e2e/foundation.spec.ts`**: dashboard KPIs render numbers; organization profile
  shows the logo and edits the display name (then restores it); invite a member, see the token block,
  see the pending invitation in the list; open Help, open a field's «i» popover on the organization
  form; the command palette finds "Members".
- [ ] **Step 2: Run** full gates: `pnpm --filter admin-ui lint && pnpm --filter admin-ui typecheck && pnpm --filter admin-ui test && pnpm --filter admin-ui build`,
  dev-stack tests with `ITAP_DEV_STACK=1`, and `pnpm --filter admin-ui test:e2e` — Expected: all PASS.
- [ ] **Step 3: Record the demo** per `.claude/skills/demo-record/SKILL.md` (login → org switch →
  dashboard → profile with logo → invite → Help) into `playwright-output/`.
- [ ] **Step 4: Write `summary-00-foundation.md`** (what was built, decisions, deviations, gaps,
  how to run, what phase 1 reuses).
- [ ] **Step 5: Commit and push** `docs(ui): phase 0 summary` → `git push -u origin feat/ui-console`.
