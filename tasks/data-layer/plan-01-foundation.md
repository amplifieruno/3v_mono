# Data Layer Slice 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A clean, reproducible data-layer foundation: working migrations/metadata pipeline, a metadata generator, an integration test harness against real Hasura, multi-tenant organizations with org-scoped tokens, per-org storage, audit log, and a seed skeleton.

**Architecture:** Postgres schema `itap` managed by Hasura CLI migrations in `apps/nhost/nhost/migrations/default`. Hasura table metadata for `itap.*` is generated from a TypeScript registry plus FK introspection (`apps/nhost/metadata-src`, `apps/nhost/scripts`). The Express backend (`apps/backend`) implements Hasura Actions behind `/hasura/actions/:name`, talks to Hasura only over GraphQL (admin secret + forwarded session headers), and signs organization tokens with the key/issuer from Hasura's `JWT_SECRET`. Behaviour is proven by vitest integration tests that call Hasura with role tokens.

**Tech Stack:** Postgres 16 + pgvector, Hasura v2.46 (Nhost images), hasura-auth 0.40, hasura-storage 0.7, Node/Express/TypeScript (ESM), vitest 2, zod 3, jsonwebtoken, yaml, tsx.

**Spec:** `tasks/data-layer/design.md` (read §4, §5, §6.0, §6.1, §6.14 before starting). Roadmap: `tasks/data-layer/roadmap.md`.

## Global Constraints

- All business tables in schema `itap`; function result tables in `itap_results`.
- Every business table: `organization_id uuid not null` → `itap.organizations(id) ON DELETE CASCADE`; `UNIQUE (organization_id, id)` only if referenced; FKs between business tables composite `(organization_id, x_id)`; constraints between business rows `ON DELETE NO ACTION` unless the spec's deletion policy says CASCADE / `SET NULL (col)`.
- Every FK column set indexed, leading with `organization_id`.
- Enum tables: `itap.<thing>_<kind>s (value text primary key, description text)`, lowercase snake values, no timestamps.
- Mutable tables: `created_at timestamptz not null default now()`, `updated_at` via `itap.set_updated_at()`; append-only tables: `created_at` only.
- GraphQL names without `itap_` prefix (`custom_name` = table name), produced by the generator, never hand-written.
- Org token: HS256, key and issuer parsed from Hasura `JWT_SECRET` JSON (`issuer: "hasura-auth"`), claims under `https://hasura.io/jwt/claims`, `x-hasura-organization-id` lowercase uuid, default role `org_admin`, allowed roles `["org_admin","user"]`, TTL 900 s.
- Roles: `public` (nothing), `user`, `org_admin`; backend uses admin secret + forwarded `x-hasura-role` / `x-hasura-user-id` / `x-hasura-organization-id`.
- `HASURA_GRAPHQL_INFER_FUNCTION_PERMISSIONS=false`.
- One logical change per migration, each with `up.sql` and `down.sql`; migration names `{timestamp}_{description}`.
- English only; no `any`; no `console.log` in committed code (use the existing logger pattern or `process.stderr` in scripts); files ~300 lines max.
- Commit format per `CLAUDE.md`: `<type>(<scope>): <subject>`, scopes `hasura`, `backend`, `docker`, `docs`.

## Review Focus

1. An org token used after its organization membership is deactivated: `switch_organization` must refuse to renew (`403`-style action error `membership_inactive`), even though the old token works until expiry.
2. An organization id in a claim with uppercase hex: the signer must lowercase it, otherwise the storage `bucket_id` text comparison silently denies all files.
3. Deleting an organization that has members, invitations, settings and audit rows must complete in one statement (NO ACTION, audit has no FK) — a reasonable admin expects org deletion not to fail.
4. A `user`-role token (no org selected) calling any `itap` business table must see nothing and be unable to insert, not get a permissions error that leaks table names it shouldn't know about (it must simply have no such root field).
5. Calling an Action without the action secret header (someone hitting the backend directly) must be rejected before any work happens.

---

### Task 1: Dev infrastructure — working migrations pipeline and clean slate

**Files:**
- Modify: `docker/docker-compose.dev.yml` (console: add volume `../apps/nhost/nhost:/hasura-project`; remove `HASURA_GRAPHQL_MIGRATIONS_DIR`/`HASURA_GRAPHQL_METADATA_DIR`; set `HASURA_GRAPHQL_INFER_FUNCTION_PERMISSIONS: 'false'` on `graphql` and `console`; pin postgres image to an exact pgvector tag, e.g. `pgvector/pgvector:0.8.0-pg16`; add `ACTION_SECRET: ${ACTION_SECRET}` and `BACKEND_URL: ${BACKEND_URL}` to `graphql`)
- Modify: `docker/docker-compose.prod.yml` (same function-permission flag, pinned image, `ACTION_SECRET`, `BACKEND_URL`)
- Modify: `Makefile` (`hasura_apply` → `docker compose --env-file .env.dev -f docker/docker-compose.dev.yml exec console hasura-cli --project /hasura-project metadata apply --endpoint http://graphql:8080 && … migrate apply --database-name default … && … metadata reload …`; new target `db_reset` that drops schemas `itap`, `itap_results` via `hasura-cli … migrate delete --all --server`/`run_sql` equivalent and re-applies)
- Modify: `.env.example` (add `ACTION_SECRET=`, `BACKEND_URL=http://host.docker.internal:3001`)
- Delete: every directory under `apps/nhost/nhost/migrations/default/`
- Delete: `apps/nhost/nhost/metadata/databases/default/tables/itap_*.yaml`, `public_test.yaml` if present; remove their lines from `tables.yaml`
- Delete from git: `apps/backend/.env`; Create: `apps/backend/.env.example` (keys only: `HASURA_GRAPHQL_URL`, `GRAPHQL_ADMIN_SECRET`, `HASURA_JWT_SECRET`, `ACTION_SECRET`, `NHOST_STORAGE_URL`, `ORG_TOKEN_TTL_SECONDS=900`, `INSIGHTFACE_API_URL`, `STREAM_SERVER_URL`, `CORS_ORIGIN`, `PORT`); add `apps/backend/.env` to `.gitignore`

- [ ] **Step 1:** Apply the compose/Makefile/env changes above. `HASURA_JWT_SECRET` in `apps/backend/.env` must be the exact JSON value of root `JWT_SECRET` (no `JWT_SECRET=` prefix).
- [ ] **Step 2:** Remove old migrations and `itap_*` metadata as listed.
- [ ] **Step 3: Verify the pipeline on an empty slate**

Run: `make dev-compose && make db_reset && make hasura_apply`
Expected: both commands exit 0; `hasura-cli … metadata ic list` reports no inconsistencies; `curl -s -H "x-hasura-admin-secret: $GRAPHQL_ADMIN_SECRET" http://<graphql>/v1/graphql -d '{"query":"{ __type(name:\"itap_identities\"){ name } }"}'` returns `null` type.

- [ ] **Step 4: Commit**

```bash
git add -A docker Makefile .env.example .gitignore apps/nhost/nhost apps/backend/.env.example
git rm --cached apps/backend/.env
git commit -m "chore(docker): Fix Hasura migrations pipeline and reset data layer"
```

---

### Task 2: Backend foundations — env, Hasura client, token signer

**Files:**
- Create: `apps/backend/src/config/env.ts`
- Create: `apps/backend/src/hasura/client.ts`
- Create: `apps/backend/src/auth/hasuraJwt.ts`
- Create: `apps/backend/vitest.config.ts` (unit: `include: ['src/**/*.test.ts']`)
- Test: `apps/backend/src/auth/hasuraJwt.test.ts`, `apps/backend/src/hasura/client.test.ts`

**Interfaces:**
- Produces:
  - `loadEnv(): Env` with `Env = { HASURA_GRAPHQL_URL: string; GRAPHQL_ADMIN_SECRET: string; HASURA_JWT_SECRET: HasuraJwtSecret; ACTION_SECRET: string; NHOST_STORAGE_URL: string; ORG_TOKEN_TTL_SECONDS: number }` (zod; `HASURA_JWT_SECRET` parsed by `parseHasuraJwtSecret`).
  - `type HasuraJwtSecret = { type: 'HS256'; key: string; issuer: string }`; `parseHasuraJwtSecret(json: string): HasuraJwtSecret`.
  - `signOrgToken(input: { userId: string; organizationId: string; role: 'org_admin'; ttlSeconds: number }, secret: HasuraJwtSecret): { token: string; expiresAt: Date }`.
  - `signBaseToken(input: { userId: string; ttlSeconds: number }, secret: HasuraJwtSecret): { token: string; expiresAt: Date }` — same claims shape as hasura-auth's own token (default role `user`, allowed `["user","me"]`); used by the test harness and the seed check.
  - `type HasuraSession = { role: string; userId?: string; organizationId?: string }`; `type HasuraClient = { request<T>(query: string, variables?: Record<string, unknown>): Promise<T> }`; `createHasuraClient(env: Env, session?: HasuraSession): HasuraClient` — always sends `x-hasura-admin-secret`; with a session also sends `x-hasura-role`, `x-hasura-user-id`, `x-hasura-organization-id`; throws `HasuraError { code: string; message: string; path?: string }` on GraphQL errors.

- [ ] **Step 1: Write the failing tests**

```ts
// hasuraJwt.test.ts
it('signs a token Hasura accepts', () => {
  const secret = parseHasuraJwtSecret(JSON.stringify({ type: 'HS256', key: 'k'.repeat(32), issuer: 'hasura-auth' }));
  const { token, expiresAt } = signOrgToken({ userId: U, organizationId: 'A1B2C3D4-0000-4000-8000-000000000001', role: 'org_admin', ttlSeconds: 900 }, secret);
  const decoded = jwt.verify(token, secret.key, { issuer: 'hasura-auth' }) as Record<string, any>;
  const claims = decoded['https://hasura.io/jwt/claims'];
  expect(claims['x-hasura-organization-id']).toBe('a1b2c3d4-0000-4000-8000-000000000001');
  expect(claims['x-hasura-default-role']).toBe('org_admin');
  expect(claims['x-hasura-allowed-roles']).toEqual(['org_admin', 'user']);
  expect(claims['x-hasura-user-id']).toBe(U);
  expect(decoded.exp - decoded.iat).toBe(900);
  expect(expiresAt.getTime()).toBe(decoded.exp * 1000);
});
it('rejects a non-HS256 secret', () => expect(() => parseHasuraJwtSecret('{"type":"RS256","key":"x"}')).toThrow());
```

```ts
// client.test.ts — stub global fetch
it('forwards session headers alongside the admin secret', async () => { /* assert headers x-hasura-admin-secret, x-hasura-role=org_admin, x-hasura-organization-id */ });
it('maps GraphQL errors to HasuraError with extensions.code', async () => { /* response {errors:[{message:'m',extensions:{code:'permission-error',path:'$.x'}}]} → rejects HasuraError code 'permission-error' */ });
```

- [ ] **Step 2:** Run `pnpm --filter backend exec vitest run src` → FAIL (modules missing).
- [ ] **Step 3:** Implement the three modules (`jsonwebtoken` `sign` with `algorithm: 'HS256'`, `issuer`, `expiresIn: ttlSeconds`; native `fetch`).
- [ ] **Step 4:** Run `pnpm --filter backend exec vitest run src` → PASS.
- [ ] **Step 5: Commit** — `feat(backend): Add env config, Hasura client and org token signer`

---

### Task 3: Metadata generator and integration test harness

**Files:**
- Modify: `apps/nhost/package.json` (name `nhost`; devDeps `tsx`, `yaml`, `typescript`, `vitest`; scripts `metadata:generate`: `tsx scripts/generate-metadata.ts`, `test`: `vitest run`)
- Create: `apps/nhost/metadata-src/types.ts`, `apps/nhost/metadata-src/index.ts` (exports `tables: TableSpec[]`, initially `[]`)
- Create: `apps/nhost/scripts/build-table-metadata.ts` (pure), `apps/nhost/scripts/introspect.ts`, `apps/nhost/scripts/generate-metadata.ts`
- Test: `apps/nhost/scripts/build-table-metadata.test.ts`
- Create: `apps/backend/vitest.integration.config.ts` (`include: ['tests/integration/**/*.test.ts']`, `fileParallelism: false`, `testTimeout: 30000`, loads root `.env.dev` and `apps/backend/.env`)
- Create: `apps/backend/tests/integration/support/fixtures.ts`, `apps/backend/tests/integration/support/clients.ts`
- Test: `apps/backend/tests/integration/smoke.test.ts`
- Modify: `apps/backend/package.json` (script `test:integration`: `vitest run -c vitest.integration.config.ts`)

**Interfaces:**
- Produces (generator):
  - `type PermissionProfile = 'tenant_crud' | 'tenant_read' | 'none'`
  - `interface TableSpec { name: string; schema?: 'itap' | 'itap_results'; isEnum?: boolean; profile: PermissionProfile; readOnlyColumns?: string[]; secretColumns?: string[]; noDelete?: boolean; relationshipNames?: Record<string, string>; extraPermissions?: HasuraPermissions }`
  - `interface ForeignKey { table: string; columns: string[]; refTable: string; refColumns: string[]; constraint: string }`
  - `buildTableMetadata(spec: TableSpec, columns: string[], outgoing: ForeignKey[], incoming: ForeignKey[]): TableMetadata` — `configuration.custom_name = spec.name`; `is_enum` for enums; object relationships from outgoing FKs via `manual_configuration` (`column_mapping` over all FK columns, so composite FKs work), name = the non-`organization_id` column minus `_id` (or `organization` for the org FK); array relationships from incoming FKs, name = child table name, or `<child>_by_<col minus _id>` when a child has several FKs to this table; `relationshipNames` overrides by constraint name.
  - Profiles: `tenant_crud` → `org_admin` select (filter `{organization_id:{_eq:X-Hasura-Organization-Id}}`, columns = all − secret, `allow_aggregations: true`), insert (check same filter, columns = all − readOnly − `organization_id`/`id`/`created_at`/`updated_at`/`created_by`, set `organization_id: x-hasura-organization-id`, `created_by: x-hasura-user-id` when the column exists), update (same filter, columns as insert), delete (same filter, unless `noDelete`); `tenant_read` → select only; `none` → no permissions. `extraPermissions` merged last (used for `user` role and special filters).
  - `generate-metadata.ts`: introspects via Hasura `POST /v2/query` `run_sql` (admin secret) over `information_schema.columns` and `pg_constraint` for schemas `itap`, `itap_results`; writes `metadata/databases/default/tables/itap_<name>.yaml` (and `itap_results_<name>.yaml`) for every spec, deletes generated files without a spec, rewrites the `itap*` include lines in `tables.yaml` keeping `auth_*`/`storage_*` lines; fails if a spec table doesn't exist or a table in `itap` has no spec.
- Produces (harness):
  - `createTestUser(email?: string): Promise<{ id: string; email: string }>` (admin `insertUser` with bcrypt `passwordHash`, `defaultRole: "user"`, roles `user`,`me`)
  - `createTestOrg(name?: string): Promise<{ id: string }>` (admin insert into `organizations`; available from Task 4)
  - `addMember(orgId: string, userId: string, status?: 'active' | 'suspended' | 'deactivated'): Promise<void>`
  - `asAdmin()`, `asUser(userId)`, `asOrgAdmin(userId, orgId)`: GraphQL clients; the last two sign tokens with `signOrgToken` / an equivalent base-token signer for role `user` and send `Authorization: Bearer` (exercises real JWT validation).
  - `expectDenied(promise)`: asserts a GraphQL error (permission or validation).

- [ ] **Step 1: Write the failing generator tests** (`build-table-metadata.test.ts`):
  - composite FK `(organization_id, profile_id) → profiles(organization_id, id)` produces object relationship `profile` with `column_mapping {organization_id: organization_id, profile_id: id}`;
  - two FKs from `incidents` to `organization_members` (`assigned_to`, `acknowledged_by`) produce array relationships `incidents_by_assigned_to` and `incidents_by_acknowledged_by` on the parent;
  - `tenant_crud` with `secretColumns: ['password']` excludes `password` from select but keeps it in insert/update; `readOnlyColumns: ['member_count']` excluded from insert/update;
  - `noDelete: true` → no delete permission; `isEnum` → `is_enum: true` and no permissions.
- [ ] **Step 2:** `pnpm --filter nhost test` → FAIL.
- [ ] **Step 3:** Implement `types.ts`, `build-table-metadata.ts`, `introspect.ts`, `generate-metadata.ts`.
- [ ] **Step 4:** `pnpm --filter nhost test` → PASS; `pnpm --filter nhost metadata:generate && make hasura_apply` → exit 0 (no tables yet).
- [ ] **Step 5: Write the smoke integration test** — `createTestUser()` returns an id; `asUser(id)` can query `__typename`; a request with a token signed by a wrong key is rejected with `invalid-jwt`.
- [ ] **Step 6:** `pnpm --filter backend test:integration` → PASS.
- [ ] **Step 7: Commit** — `feat(hasura): Add metadata generator and integration test harness`

---

### Task 4: Tenancy schema — organizations, members, settings

**Files:**
- Create migrations (each `up.sql`/`down.sql`):
  - `…_create_schemas` — schemas `itap`, `itap_results`; `itap.set_updated_at()`
  - `…_create_tenancy_enums` — `itap.organization_statuses (active, suspended)`, `itap.member_roles (admin)`, `itap.member_statuses (active, suspended, deactivated)`
  - `…_create_organizations` — `itap.organizations (id, name, slug unique, legal_name, logo_file_id uuid → storage.files ON DELETE SET NULL, timezone default 'UTC', locale default 'en', status → organization_statuses default 'active', created_at, updated_at)`
  - `…_create_organization_settings` — `itap.organization_settings (organization_id pk → organizations CASCADE, recognition_threshold real not null default 0.5, tracking_timeout_seconds int not null default 300, archive_unknown_after_days int not null default 90, tailgating_window_seconds int not null default 5, default_retention_days int not null default 90, detection_counter_throttle_seconds int not null default 10, updated_at)`; trigger on `organizations` insert creates the row
  - `…_create_organization_members` — per spec §4.2: `(id, organization_id, user_id → auth.users NO ACTION, role → member_roles default 'admin', status → member_statuses default 'active', title, department, joined_at default now(), expires_at, deactivated_at, deactivated_by, quiet_hours jsonb, vacation_until timestamptz, vacation_delegate_user_id, created_at, updated_at)`, `UNIQUE (organization_id, user_id)`, composite FKs `(organization_id, deactivated_by)` and `(organization_id, vacation_delegate_user_id)` → `organization_members(organization_id, user_id)` NO ACTION, CHECK `status <> 'deactivated' OR deactivated_at IS NOT NULL`
  - `…_create_active_member_check` — `itap.active_member_check()` trigger function: for each column name in `TG_ARGV`, if the column changed (or on insert) and is not null, require an `active` member `(NEW.organization_id, value)`; raise `check_violation` with message `member_not_active:<column>`; attached to `organization_members` for `vacation_delegate_user_id`
  - `…_create_user_settings` — `itap.user_settings (user_id pk → auth.users NO ACTION, locale, timezone, last_organization_id → organizations ON DELETE SET NULL, updated_at)`
- Create: `apps/nhost/metadata-src/tenancy.ts` (specs below), register in `metadata-src/index.ts`
- Test: `apps/backend/tests/integration/tenancy.test.ts`; extend `support/fixtures.ts` with `createTestOrg`, `addMember`

**Interfaces:**
- Produces: tables `organizations`, `organization_settings`, `organization_members`, `user_settings`; function `itap.active_member_check()` (reused by later slices: `CREATE TRIGGER … EXECUTE FUNCTION itap.active_member_check('assigned_to','acknowledged_by')`); fixtures `createTestOrg`, `addMember`.
- Metadata specs (`tenancy.ts`):
  - `organizations`: `none` profile + `extraPermissions`: `org_admin` select/update on `{id:{_eq:X-Hasura-Organization-Id}}` (update columns: name, legal_name, logo_file_id, timezone, locale); `user` select where `{members:{user_id:{_eq:X-Hasura-User-Id}, status:{_eq:"active"}}}` columns id, name, slug, logo_file_id.
  - `organization_settings`: `org_admin` select/update own row (all columns except organization_id on update).
  - `organization_members`: `tenant_crud`, `noDelete: true`, `readOnlyColumns: ['deactivated_at','deactivated_by','joined_at']`; plus `user` select own rows `{user_id:{_eq:X-Hasura-User-Id}}`.
  - `user_settings`: `user` and `org_admin` select/insert/update where `{user_id:{_eq:X-Hasura-User-Id}}`, preset `user_id`, columns locale, timezone (last_organization_id is set by the backend only).
  - Enums: `isEnum: true`.

- [ ] **Step 1: Write the failing integration tests** (`tenancy.test.ts`):
  - creating an organization creates its `organization_settings` row with `recognition_threshold = 0.5`;
  - `asOrgAdmin(u, A)` sees org A and its members, and `organizations`/`organization_members` of org B return `[]`;
  - `asOrgAdmin(u, A)` cannot insert a member with `organization_id` B (preset forces A) and cannot update org B (0 affected rows);
  - `asUser(u)` lists only orgs where u is an active member; a deactivated membership hides the org; `asUser` has no `organization_settings` root field (Review Focus 4);
  - setting `vacation_delegate_user_id` to a user who is a member of org B only → error containing `foreign key` (composite FK); to a deactivated member of A → error containing `member_not_active:vacation_delegate_user_id`;
  - deleting an organization (admin) with members and settings succeeds in one mutation (Review Focus 3).
- [ ] **Step 2:** `pnpm --filter backend test:integration -- tenancy` → FAIL.
- [ ] **Step 3:** Write the migrations and `tenancy.ts`; run `make hasura_apply && pnpm --filter nhost metadata:generate && make hasura_apply`.
- [ ] **Step 4:** `pnpm --filter backend test:integration -- tenancy` → PASS.
- [ ] **Step 5: Commit** — `feat(hasura): Add organizations, members and settings`

---

### Task 5: Audit log

**Files:**
- Create migrations: `…_create_audit_log` (`itap.audit_actions` enum: insert, update, delete, switch_org, export, view_sensitive, merge, rollback, approve, reject, publish; `itap.audit_log (id, organization_id uuid not null — no FK, user_id uuid, action → audit_actions, entity text, entity_id uuid, changes jsonb, reason text, ip inet, user_agent text, occurred_at timestamptz default now())`, index `(organization_id, occurred_at desc)`, `(organization_id, entity, entity_id)`), `…_create_audit_row_change` (`itap.audit_row_change()` + triggers on `organizations`, `organization_members`, `organization_settings`)
- Create: `apps/nhost/metadata-src/audit.ts`
- Test: `apps/backend/tests/integration/audit.test.ts`

**Interfaces:**
- Produces: `itap.audit_row_change()` trigger function, attached by later slices as `CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.<t> FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change('<redacted_col>', …)`.
  - `TG_ARGV` = columns to redact (stored as `"[redacted]"`).
  - `changes` = for update `{col: {old, new}}` of changed columns only; insert/delete: full row (redacted).
  - `TG_ARGV` entries of the form `ignore:<col>` mark system-managed columns; an update whose changed columns are all `updated_at` or `ignore:` columns writes no audit row. Plain entries are redacted columns.
  - Skips when the organization row no longer exists (cascade).
  - `user_id` = `(current_setting('hasura.user', true)::json ->> 'x-hasura-user-id')::uuid` (null-safe).
  - `organization_id` = `NEW.organization_id`/`OLD.organization_id`, or `id` for the `organizations` table.
- Metadata: `audit_log` `tenant_read`; `audit_actions` enum.

- [ ] **Step 1: Write the failing tests:** updating org name as `asOrgAdmin(u, A)` writes one `audit_log` row with `user_id = u`, `action = 'update'`, `changes = {name: {old, new}}`; `asOrgAdmin(u, B)` can't see A's audit rows; `asOrgAdmin` cannot insert/update/delete audit rows (no such mutation fields); an update touching only an `ignore:` column writes nothing (use `organization_members.updated_at`-only update via admin); deleting org A leaves its audit rows in place (no FK) and does not fail.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement migrations + spec; apply; regenerate. **Step 4:** run → PASS.
- [ ] **Step 5: Commit** — `feat(hasura): Add audit log with row-change trigger`

---

### Task 6: Per-organization storage

**Files:**
- Create migrations: `…_create_org_buckets` (`itap.create_org_bucket()` trigger on `organizations` insert: `INSERT INTO storage.buckets (id, …defaults) VALUES (NEW.id::text) ON CONFLICT DO NOTHING`; insert bucket `org-logos`), `…_create_check_file_bucket` (`itap.check_file_bucket()` trigger function: for each column in `TG_ARGV`, if not null require `storage.files.bucket_id = NEW.organization_id::text`, else raise `check_violation` `file_not_in_org_bucket:<column>`; not attached yet — first used in slice 2)
- Modify: `apps/nhost/nhost/metadata/databases/default/tables/storage_files.yaml` (hand-edited: Nhost-owned table): `org_admin` insert check and select filter both `{_or: [ OWN, {bucket_id:{_eq:"org-logos"}} ]}` where `OWN = {_and:[{bucket_id:{_eq:X-Hasura-Organization-Id}}, {_not:{metadata:{_contains:{kind:"profile_document"}}}}, {_not:{metadata:{_contains:{kind:"dsr_export"}}}}, {_not:{metadata:{_contains:{kind:"auth_capture"}}}}]}`; **no delete**; `user` select `{bucket_id:{_eq:"org-logos"}}`
- Modify: `storage_buckets.yaml` (`org_admin`/`user` select own bucket / `org-logos`, read-only)
- Test: `apps/backend/tests/integration/storage.test.ts`

**Interfaces:**
- Produces: bucket per organization (id = org uuid text); `itap.check_file_bucket()` for later slices; fixture `uploadFile(token, bucketId, metadata?): Promise<{ id: string } | { status: number }>` (multipart `POST ${NHOST_STORAGE_URL}/files` with `bucket-id` and `metadata[]` form fields).

- [ ] **Step 1: Write the failing tests:** new org → bucket `<orgId>` exists; `asOrgAdmin(u, A)` uploads to bucket A → 201 and can select the file row; upload to bucket B → 403; upload with metadata `{kind:"profile_document"}` → 403; `org_admin` has no `deleteFile` mutation; a token whose org id was uppercase is impossible (signer lowercases — asserted in Task 2) and a lowercase-token upload succeeds (Review Focus 2).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5: Commit** — `feat(hasura): Add per-organization storage buckets and permissions`

---

### Task 7: Actions infrastructure and `switch_organization`

**Files:**
- Create: `apps/backend/src/actions/router.ts`, `apps/backend/src/actions/switchOrganization.ts`
- Modify: `apps/backend/src/index.ts` (mount `app.use('/hasura/actions', actionsRouter(loadEnv()))` with `express.json()`)
- Modify: `apps/nhost/nhost/metadata/actions.graphql`, `actions.yaml`
- Test: `apps/backend/src/actions/router.test.ts`, `apps/backend/tests/integration/switch-organization.test.ts`

**Interfaces:**
- Consumes: `loadEnv`, `createHasuraClient`, `signOrgToken` (Task 2).
- Produces:
  - `type ActionPayload<I> = { action: { name: string }; input: I; session_variables: Record<string, string> }`
  - `type ActionHandler<I, O> = (ctx: { env: Env; input: I; session: HasuraSession; admin: HasuraClient; asCaller: HasuraClient }) => Promise<O>`
  - `class ActionError extends Error { constructor(code: string, message: string) }` → HTTP 400 `{ message, extensions: { code } }` (Hasura action error format)
  - `actionsRouter(env: Env, handlers?: Record<string, ActionHandler<any, any>>): Router` — rejects missing/wrong `x-action-secret` with 401 before parsing input (Review Focus 5); unknown action → 404; session built from `session_variables` (`x-hasura-role`, `x-hasura-user-id`, `x-hasura-organization-id`).
  - GraphQL: `switch_organization(organization_id: uuid!): OrgToken!` with `type OrgToken { access_token: String! expires_at: timestamptz! organization_id: uuid! role: String! }`; handler URL `{{BACKEND_URL}}/hasura/actions/switch_organization`, header `x-action-secret: {{ACTION_SECRET}}`; permissions `user`, `org_admin`.
  - Behaviour: requires `x-hasura-user-id`; loads membership via admin client; not found → `ActionError('not_a_member')`; status ≠ active or `expires_at` past → `ActionError('membership_inactive')` (Review Focus 1); org status ≠ active → `ActionError('organization_suspended')`; signs token (role `org_admin` for `admin`); upserts `user_settings.last_organization_id`; inserts `audit_log` `{action: 'switch_org', entity: 'organization', entity_id}` with the caller's user id.

- [ ] **Step 1: Write the failing unit test** (`router.test.ts`, supertest-free: call the router with a mocked req/res or `node:http` on an ephemeral port): no header → 401 and handler not called; wrong action → 404; `ActionError('x','m')` → 400 body `{message:'m', extensions:{code:'x'}}`.
- [ ] **Step 2: Write the failing integration test** (`switch-organization.test.ts`, backend must be running: start it in `beforeAll` via `app.listen(0)` and point `BACKEND_URL` at it, or require `pnpm --filter backend dev` — choose the in-process server):
  - member of A gets a token; with it, `organizations` returns exactly A;
  - non-member → error code `not_a_member`; deactivated member → `membership_inactive`; suspended org → `organization_suspended`;
  - after switching, `user_settings.last_organization_id = A` and an `audit_log` row `switch_org` exists for A with `user_id = u`.
- [ ] **Step 3:** run both → FAIL. **Step 4:** implement; `make hasura_apply`. **Step 5:** run both → PASS.
- [ ] **Step 6: Commit** — `feat(backend): Add Hasura actions router and switch_organization`

---

### Task 8: Invitations

**Files:**
- Create migration: `…_create_organization_invitations` (`itap.invitation_statuses` enum: pending, accepted, revoked, expired; `itap.organization_invitations (id, organization_id, email citext not null, role → member_roles default 'admin', token_hash text not null, status default 'pending', expires_at timestamptz not null, invited_by, accepted_by uuid → auth.users, accepted_at, created_at, updated_at)`, composite FK `(organization_id, invited_by)` → members NO ACTION, partial unique `(organization_id, email) where status = 'pending'`; audit trigger with `token_hash` redacted)
- Modify: `apps/nhost/metadata-src/tenancy.ts` (`organization_invitations`: `tenant_crud`, `secretColumns: ['token_hash']`, `readOnlyColumns: ['token_hash','accepted_by','accepted_at']`, insert disabled for org_admin — creation only via action)
- Create: `apps/backend/src/actions/invitations.ts`; register in router
- Modify: `actions.graphql`, `actions.yaml`
- Test: `apps/backend/tests/integration/invitations.test.ts`

**Interfaces:**
- Produces:
  - `invite_member(email: String!, role: String = "admin"): Invitation!` → `type Invitation { invitation_id: uuid! token: String! expires_at: timestamptz! }` (role `org_admin`; token = 32 random bytes base64url, stored as sha256 hex; expires in 7 days; email "sent" = structured log line; returns the plaintext token once).
  - `accept_invitation(token: String!): AcceptedInvitation!` → `{ organization_id: uuid! }` (role `user`; matches sha256(token), status pending, not expired, and `auth.users.email` of the caller equals invitation email case-insensitively; creates or reactivates the membership; marks accepted).

- [ ] **Step 1: Write the failing tests:** invite → `token_hash` not selectable by org_admin and shown as `"[redacted]"` in audit; accept by the matching user → active membership in A; accept by a different email → `email_mismatch`; reuse → `invitation_not_pending`; expired → `invitation_expired`; second pending invite to the same email → `already_invited`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement; apply; regenerate. **Step 4:** run → PASS.
- [ ] **Step 5: Commit** — `feat(backend): Add organization invitations`

---

### Task 9: `open_file` and `delete_file`

**Files:**
- Create: `apps/backend/src/storage/storageClient.ts`, `apps/backend/src/actions/files.ts`; register in router
- Modify: `actions.graphql`, `actions.yaml`
- Test: `apps/backend/tests/integration/files.test.ts`

**Interfaces:**
- Produces:
  - `type StorageClient`; `createStorageClient(env: Env): StorageClient` with `{ presignedUrl(fileId: string): Promise<{ url: string; expiresAt: Date }>; deleteFile(fileId: string): Promise<void>; upload(input: { bucketId: string; name: string; mimeType: string; data: Buffer; metadata?: Record<string, unknown> }): Promise<{ id: string }> }` (admin secret; `GET /files/{id}/presignedurl`, `DELETE /files/{id}`, `POST /files`). `upload` is used by later slices (crops, reports, documents).
  - `open_file(file_id: uuid!): FileUrl!` → `{ url: String! expires_at: timestamptz! }`; `delete_file(file_id: uuid!): DeletedFile!` → `{ file_id: uuid! }`; both role `org_admin`; both require `storage.files.bucket_id = session org` else `ActionError('file_not_found')` (no existence leak); `open_file` writes `audit_log` `view_sensitive` when `metadata.kind` is sensitive.

- [ ] **Step 1: Write the failing tests:** a sensitive file uploaded via `createStorageClient.upload` into bucket A: `open_file` as A returns a URL that downloads the bytes and writes a `view_sensitive` audit row; as B → `file_not_found`; `delete_file` as A removes it (subsequent `open_file` → `file_not_found`); B cannot delete A's file.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5: Commit** — `feat(backend): Add open_file and delete_file actions`

---

### Task 10: Seed skeleton

**Files:**
- Create: `apps/backend/src/seed/index.ts` (CLI: `--reset`), `apps/backend/src/seed/tenancy.ts`
- Modify: `apps/backend/package.json` (script `seed`: `tsx src/seed/index.ts`); root `package.json` (script `seed`: `pnpm --filter backend seed`)
- Modify: `apps/backend/.env.example` (`SEED_PASSWORD=`)
- Test: `apps/backend/tests/integration/seed.test.ts`

**Interfaces:**
- Produces: `seedTenancy(ctx: SeedContext): Promise<SeedTenancyResult>` with `SeedContext = { env: Env; admin: HasuraClient; storage: StorageClient; now: Date }` and `SeedTenancyResult = { users: { admin: string; novaAdmin: string; riversideAdmin: string }; orgs: { nova: string; riverside: string } }` — later slices add `seed<Area>(ctx, previous)` steps to `index.ts`.
  - Users (fixed emails): `admin@itap.demo` (member of both orgs), `nova.admin@itap.demo`, `riverside.admin@itap.demo`; password from `SEED_PASSWORD`; upsert by email.
  - Orgs (fixed slugs): `nova-tower` "Nova Tower Business Center" (timezone `Europe/Moscow` — builder may pick the demo's timezone), `riverside-office-park` "Riverside Office Park".
  - `--reset`: deletes the two orgs by slug (cascade), deletes their storage files through `StorageClient.deleteFile`, then reseeds; without `--reset` it is idempotent (second run changes nothing).

- [ ] **Step 1: Write the failing test:** running `seed` twice yields exactly 2 orgs with those slugs and 3 memberships; `admin@itap.demo` can log in via hasura-auth `POST /signin/email-password` with `SEED_PASSWORD` and `switch_organization` into both orgs.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5: Commit** — `feat(backend): Add seed skeleton with demo organizations`

---

### Task 11: Conventions and documentation

**Files:**
- Modify: `.claude/rules/hasura-conventions.md` (enum values lowercase; composite tenant FKs; metadata for `itap.*` generated via `pnpm --filter nhost metadata:generate`, never hand-edited; tracked functions take `hasura_session`; `INFER_FUNCTION_PERMISSIONS=false`)
- Modify: `.claude/rules/demo-project.md` (rule 6: external side effects may be stubbed when the data flow is real — cite design §8.5)
- Modify: `CLAUDE.md` (Data Layer section: where the spec/roadmap/plans live; commands `make db_reset`, `make hasura_apply`, `pnpm --filter nhost metadata:generate`, `pnpm --filter backend test:integration`, `pnpm seed`; remove stale Redis/TypeORM/face-api.js claims)
- Create: `tasks/data-layer/summary-01-foundation.md` (what was built, decisions, deviations from plan)

- [ ] **Step 1:** Edit the files.
- [ ] **Step 2: Run the quality gates**

Run: `pnpm lint && pnpm typecheck && pnpm --filter backend exec vitest run && pnpm --filter nhost test && pnpm --filter backend test:integration`
Expected: all exit 0. (`pnpm build` too; admin-ui is known-broken against the new schema at runtime but must still build.)

- [ ] **Step 3: Commit and push** — `docs(docs): Document data layer conventions and slice 1 summary`; then `git pull --rebase && bd sync && git push`.
