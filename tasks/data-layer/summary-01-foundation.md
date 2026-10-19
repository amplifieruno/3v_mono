# Slice 1 summary: Foundation (tenancy, auth/token, storage, audit)

Branch `feat/data-layer-foundation`. Spec: `design.md`; plan: `plan-01-foundation.md`.

## What was built

1. **Hasura pipeline fixed and data layer reset** (`make hasura_apply`, `make db_reset`; pgvector image pinned; `INFER_FUNCTION_PERMISSIONS=false`; `public.test` removed; committed backend `.env` replaced by `.env.example`; `staff` role no longer seeded).
2. **Backend foundation**: validated env config, Hasura GraphQL client (admin secret), org-token signer (`signOrgToken`/`signBaseToken`).
3. **Metadata generator** (`apps/nhost/metadata-src/`, `scripts/`, `pnpm --filter nhost metadata:generate`): generates `itap.*` tables, relationships and permissions from table definitions; plus the integration test harness.
4. **Tenancy**: `organizations`, `organization_settings`, `organization_members` (deactivation trigger), `user_settings`, `organization_invitations`; roles `user` and `org_admin`; composite tenant FKs.
5. **Audit**: `audit_actions`, `audit_log`, reusable `audit_row_change(...)` trigger function (supports ignore/redaction args).
6. **Storage**: per-organization buckets, storage permissions, `check_file_bucket`.
7. **Actions router** (`apps/backend/src/actions/`): `switch_organization`, `invite_member`, `accept_invitation` (atomic SQL function `itap.accept_invitation`), `open_file`, `delete_file`. Handlers write through an `actor` client so audit rows record the caller.
8. **Seed skeleton** (`pnpm seed`, `--reset`): two organizations (Nova Tower Business Center, Riverside Office Park), 3 users, 4 memberships.
9. **Conventions**: `.claude/rules/hasura-conventions.md`, `demo-project.md` (external side effects may be stubbed, design 8.5), `CLAUDE.md`.

## Decisions and rulings

- Work on the feature branch in the main checkout (compose mounts relative paths and gitignored `.env.dev`).
- `organizations -> organization_members` array relationship is named `members`; FK columns without `_id` suffix are named `<col>_<singular ref table last segment>` (e.g. `assigned_to_member`).
- `db_reset`: drops `itap`, `itap_results` CASCADE, clears Hasura migration state, reapplies; never touches `auth`/`storage`.
- Test typing uses `jwt.JwtPayload` and `Record<string, unknown>` (no `any`).
- **Backend runs in the dev compose network** (service `backend`, `BACKEND_URL=http://backend:3001`): host ufw blocks docker->host:3001, and the host firewall was deliberately not changed. Integration tests use the running container. Mirrors prod.
- Actor recording: handler context has `actor` (admin secret plus the caller's user/org session variables) so the audit trigger sees the real actor.
- Invitation acceptance is one SQL function (spec 8.0: multi-step atomic logic belongs in SQL); invitations are never deleted (history).
- hasura-storage 0.7 writes file metadata as admin after insert, so org_admin cannot be blocked from self-labelling sensitive kinds at upload. Accepted: sensitive kinds are unselectable for org_admin; only `open_file` (audited) reads them.
- Traefik bumped v3.3 -> v3.6 (incompatible with Docker 29).
- Seed orgs: timezone Europe/Moscow, locale en. Plan said 3 memberships; correct count is 4.
- Task 11: backend/shared ESLint flat configs added (legacy dirs relaxed: `no-explicit-any` off in backend legacy, warning in `packages/shared`; `*.d.ts` ignored); dead TypeORM entity imports and `run-migrations.ts` (+ `migration:run` script) removed; minimal type fixes in `routes/face.ts`/`insightFaceService.ts`/`Identity` entity (type-only); unused `apps/nhost/docker-compose.yaml` removed.

## Deviations from plan

- Backend in compose instead of in-process test server (see above).
- `staff` role dropped; 4 memberships instead of 3; Task 4/5/6/8 fix rounds added `insertOnlyColumns` generator option, `audit_actions.description`, NULL-safe file metadata checks, `accept_invitation` SQL function, `actor` client.

## Known limitations and deferred minors

- **Secret hygiene (owner action)**: the old Hasura JWT key exists in git history (6 commits of `apps/backend/.env`) and equals the current dev `JWT_SECRET` key; not rotated. Rotate before anything non-dev uses it.
- Dev backend container uses host `node_modules` (a fresh clone needs a host `pnpm install`).
- Hasura client: no `res.ok`/non-JSON handling; top-level `{code,error}` responses return undefined data silently. No test for signing without issuer.
- Actions: secret compare leaks length; 413 not in action error format; storage 404 on delete not mapped to `file_not_found`; `delete_file` not audited; presigned URL response not validated; `email_mismatch` checked after status/expiry; invite check-expire-insert not atomic (unique index catches race); RAISE-to-error-code mapping relies on `HASURA_GRAPHQL_ADMIN_INTERNAL_ERRORS=true`.
- Hasura: deactivation by a session user who is not a member of that org hits an FK violation on `deactivated_by` (actions must forward a member id); `check_file_bucket` ignores `organization_id` changes; array-shaped metadata bypasses sensitive guard on direct insert (own bucket only); `uploaded_by_user_id`/`etag` insertable.
- Tests: `expectDenied` accepts validation-failed (prefer asserting filtered rows); harness not typechecked (tsconfig excludes tests/); test users not cleaned up; seed `previous` typed `Partial<SeedResults>`; reset leaves bucket rows and does not assert file deletion.
- Legacy: TypeORM, face-api.js, TensorFlow and redis deps still in the backend `package.json`; removed in slice 2. admin-ui builds but is runtime-broken against the new schema. Legacy backend lint warnings remain (unused vars).

## How to run

```bash
pnpm install
cp .env.example .env.dev      # fill secrets; ACTION_SECRET: openssl rand -hex 32
make dev-compose              # infra + backend container
make hasura_apply             # (or make db_reset for a clean slate)
pnpm seed                     # demo orgs/users
pnpm --filter nhost metadata:generate   # after changing metadata-src/
pnpm lint && pnpm typecheck && pnpm build
pnpm --filter backend exec vitest run src
pnpm --filter nhost test
pnpm --filter backend test:integration  # needs the dev stack running
```
