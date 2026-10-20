# Prod cutover runbook (data layer, slices 1-10)

**This is a runbook only.** Nothing in it was executed by the agents: production, its volumes and its secrets are untouched. The owner (or an operator acting for them) runs it.

The cutover replaces the old production data with the new data layer. The database and the file storage are recreated, all migrations and metadata are applied, and the demo seed runs on the server (`design.md` §10). No production data is migrated.

Files referenced: `docker/docker-compose.prod.yml`, `Makefile` (`prod`, `prod-down`, `prod-rebuild`), `.env.example` (variable names), `apps/backend/src/config/env.ts` (backend variables), `apps/nhost/initdb.d/0001-create-schema.sql`, `apps/nhost/nhost/` (migrations and metadata).

Throughout, `DC` stands for `docker compose --env-file .env.prod -f docker/docker-compose.prod.yml`, run from the repository root on the server.

**Env files.** Until step 6, `.env.prod` is the **old** file the running stack was started with: `DC` and `make prod-down` must use it to reach the old project (its `COMPOSE_PROJECT_NAME`). The new values are prepared in `.env.prod.new` (step 2) and become `.env.prod` only at the start of step 6, after the backup and the stop of the old stack (step 5).

## 0. Plan and timing

| Phase | Approx. time | Downtime |
|---|---|---|
| 1-4 Prerequisites, secrets, compose review, audit of the old DB (read-only) | 1-2 h, before the window | none |
| 5 Backup of the old stack | 10-20 min | starts here |
| 6-7 Recreate DB and storage, apply migrations and metadata | 10 min | yes |
| 8 Seed on the server | about 6 min (`pnpm seed --reset` took 355 s on dev; a fresh database takes about the same) | yes |
| 9-10 Webhook wiring check, verification | 30 min, plus a check the next morning for the daily crons | ends after the checks |

## 1. Prerequisites

- [ ] The release commit is chosen. The work is on `feat/data-layer-foundation` and nothing is merged to `main`: the owner merges or picks the commit. Record its hash.
- [ ] Shell access to the server, Docker Engine with Compose v2, and enough disk for a full backup of the old `pgdata` and `minio` volumes.
- [ ] CPU and RAM: InsightFace runs with `cpus: 4.0` and `mem_limit: 4g` (needed for the face-auth p95 of 2 s). Postgres, Hasura, the backend and the frontend need more on top, so plan at least 6 cores and 8 GB RAM.
- [ ] `libs/InsightFace-REST` submodule checked out with its models (`git submodule update --init`); the prod `insightface` image builds from it.
- [ ] The stream-server serves the streams `entrance`, `lobby`, `serverroom` and `warehouse`. The seeded cameras are bound to these ids; the end-to-end detection check (step 10) needs one of them.
- [ ] The edge proxy on the external `proxy` network routes the hosts `${APP_URL}`, `${API_URL}`, `${GRAPHQL_URL}`, `${AUTH_URL}`, `${STORAGE_URL}`, `${STREAM_URL}` and terminates TLS. The compose file's own `traefik` service publishes no ports (`ports: []`), and its routers use the plain `web` entrypoint with TLS labels commented out.
- [ ] `.env.prod` exists on the server only. It is git-ignored (`.gitignore`: `.env.*`); never commit it.

## 2. Secrets to rotate

Treat every value that was ever used in dev as leaked:
- The dev Postgres was reachable publicly with trust auth in February 2026 (ransom-note database `readme_to_recover`, see slice 2).
- The old Hasura JWT key is in git history: 6 commits of `apps/backend/.env` and 2 commits of the root `.env`.
- The dev admin secret is the default `change-me`.

Generate new values on the server and put them into a **new file `.env.prod.new`** (do not edit `.env.prod` yet: the old stack is still running with it, and step 5 needs it to back it up and stop it). Never copy a dev value.

```bash
umask 077
cp .env.example .env.prod.new          # variable names; fill in every value below, never copy one from .env.prod
```

| Variable (`.env.prod.new`) | Used by | Generate | Notes |
|---|---|---|---|
| `GRAPHQL_ADMIN_SECRET` | graphql, auth, storage, migrate, backend (`GRAPHQL_ADMIN_SECRET`) | `openssl rand -hex 32` | Dev default is `change-me`. |
| `POSTGRES_PASSWORD` | postgres, graphql, auth, storage, migrate | `openssl rand -hex 32` | Applied only when the volume is initialised. That is fine here because the volume is recreated (step 6). On a kept volume, change it with `ALTER ROLE postgres PASSWORD ...` as well. |
| `JWT_SECRET` | graphql (`HASURA_GRAPHQL_JWT_SECRET`), auth, backend (`JWT_SECRET`, `HASURA_JWT_SECRET`) | key: `openssl rand -hex 32` | Same JSON shape as dev: `{"type":"HS256","key":"<new key>","issuer":"hasura-auth"}`. The old key is in git history and must never be used again. Rotating it invalidates every session and org token (expected). |
| `ACTION_SECRET` | graphql (header `x-action-secret` on actions, event triggers and crons via `value_from_env`), backend | `openssl rand -hex 32` | Both containers read the same variable. |
| `AUTH_KEY_ENCRYPTION_KEY` | backend; the seed (inside the backend container) | `openssl rand -hex 32` (exactly 64 hex characters) | **New in slices 9-10.** It encrypts face-auth client key secrets (AES-256-GCM, AAD = key prefix) and integration secrets (AAD = integration id), and it derives session nonces. If it is unset, `/v1/auth/*` keyed routes answer 503 `service_not_configured`, `rotate_client_key` and `set_integration_secret` refuse, and the seed stores no client keys and no SIEM demo secret. Never change it afterwards without re-issuing every client key and integration secret (there is no re-encryption tool). |
| `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` | minio (root user), storage | `openssl rand -hex 16` / `openssl rand -hex 32` | MinIO root credentials. |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_ENDPOINT` | passed to the backend | — | Not read by the backend any more (`env.ts`): leave empty or remove. |
| `SEED_PASSWORD` | the seed run only (step 8) | password manager | Password of the seeded users (`admin@itap.demo`, `nova.admin@itap.demo`, `riverside.admin@itap.demo`, `operator@itap.demo`). It is not in the compose file: pass it to the seed command only. |
| `INSIGHTFACE_API_KEY` | backend | — | Only if the InsightFace service is configured to require one. |

Also set the non-secret variables the prod compose needs:
- `BACKEND_PORT` (3001). The backend traefik label uses `${BACKEND_PORT}` without a default.
- `INSIGHTFACE_API_URL=http://insightface:18080` and `INSIGHTFACE_PORT`.
- The host names (`APP_URL`, `API_URL`, `GRAPHQL_URL`, `AUTH_URL`, `STORAGE_URL`, `STREAM_URL`, `DB_URL`, `FUNCTIONS_URL`).
- `AUTH_EMAIL_SIGNIN_EMAIL_VERIFIED_REQUIRED`.
- **A new `COMPOSE_PROJECT_NAME`** (for example `itap_v2`), so the old volumes stay untouched for rollback (step 6).

`.env.prod.new` stays unused until step 6. After the cutover, check that no secret appears in shell history or in tickets, and keep the old `.env.prod` only inside the encrypted backup (step 5).

## 3. Compose review (`docker/docker-compose.prod.yml`)

### Already in the file: verify only

- **postgres**: no published port (internal network only; admin access via SSH tunnel or `DC exec postgres psql`); image `pgvector/pgvector:0.8.0-pg16`; `initdb.d` creates the `auth` / `storage` schemas and the `pgcrypto` / `citext` extensions. `POSTGRES_DEV_INSECURE` is ignored by the image (slice 2 ruling): harmless, can be removed.
- **minio**: no published port.
- **insightface**: published only as `127.0.0.1:${INSIGHTFACE_PORT}:18080`, `cpus: 4.0`, `mem_limit: 4g`. Before relying on it, check that the host has those cores (`nproc`).
- **backend**:
  - `WEBHOOK_SINK_ENABLED: 'false'` and `WEBHOOK_ALLOW_PRIVATE_TARGETS: 'false'` (hard-coded, keep them).
  - `AUTH_KEY_ENCRYPTION_KEY: ${AUTH_KEY_ENCRYPTION_KEY:-}` is passed through.
  - `NODE_ENV: production`: the seed prints only key prefixes, never secrets.
- **graphql**:
  - `HASURA_GRAPHQL_INFER_FUNCTION_PERMISSIONS: 'false'`, `HASURA_GRAPHQL_DEV_MODE: 'false'`.
  - `BACKEND_URL: http://backend:${BACKEND_PORT:-3001}` (internal network) and `ACTION_SECRET` are what the webhook templates resolve against (step 9).
  - Keep `HASURA_GRAPHQL_ADMIN_INTERNAL_ERRORS: 'true'`. The backend maps SQL `RAISE` codes from Hasura's internal error details (slice 1 known limit). It applies to admin-secret requests only.

### Changes to make before the cutover

These are repository changes that were not made by this task. Owner decision; commit them to the release commit.

1. **No public Hasura admin surface.** The `hasura` router publishes `PathPrefix(/v1) || PathPrefix(/v2) || PathPrefix(/api/) || PathPrefix(/console/assets)` on `${GRAPHQL_URL}`. That includes `/v1/metadata` and `/v2/query` (`run_sql`), which are guarded only by the admin secret.
   - Restrict the rule to `Path(/v1/graphql)`. The UI needs only GraphQL and its websocket on that path.
   - Set `HASURA_GRAPHQL_ENABLE_CONSOLE: 'false'` and `HASURA_GRAPHQL_CORS_DOMAIN: https://${APP_URL}` (instead of `*`).
   - Migrations and metadata go through the internal network (`migrate` service), so nothing operational needs the public metadata API.
2. **Backend internals not public.** The `backend` router publishes the whole backend on `${API_URL}`, including `/hasura/actions/*` and `/hasura/events/*`, which are protected only by `x-action-secret`. Hasura reaches them over the internal network. Only `/health`, `/v1/auth/*` (face-auth clients) and `/socket.io` (live detections) need to be public. Add `&& !PathPrefix(/hasura)` to the rule.
3. **Ports bound to 127.0.0.1 only.** Keep the rule that no service publishes on `0.0.0.0`; today only insightface publishes, on 127.0.0.1. After `make prod`, `ss -tlnp` on the server must show no Docker-published port on a public address except the edge proxy's 80/443.
4. **`RECOGNITION_ENABLED` decision.** It is not set, so it defaults to on: the recognition manager polls every 10 s for cameras with `recognition_enabled`. The seeded cameras are off, so it is idle until someone calls `recognition_start`. Options:
   - leave it unset, for live demos;
   - set `RECOGNITION_ENABLED: 'false'`, the kill switch for the whole manager. Use this if InsightFace CPU must be reserved for face authentication. The detection check in step 10 then needs a temporary re-enable.
5. **TLS and proxy hops.** `/v1/auth/*` must only be served over HTTPS (edge proxy). The backend uses `trust proxy 1`: exactly one proxy hop must sit in front of it, or the client IP recorded on authentication attempts is wrong.
6. **hasura-auth hardening (optional).** Out of the data layer's scope, but worth doing:
   - `AUTH_DISABLE_SIGNUP` is `'false'` (open sign-up; users without a membership see nothing, but accounts can be created);
   - `AUTH_CLIENT_URL` is `http://localhost:3000`;
   - SMTP points at `mailhog`.

## 4. Security audit of the production database (read-only)

The dev database carried attacker persistence (found in slices 2-4, removed by rebuilding the dev volume on 2026-10-19):
- a superuser login role `priv_esc` (password inside a function body);
- event triggers `log_start` / `log_end` (`ddl_command_start` / `ddl_command_end`) running `public.escalate_priv()`, which re-creates the role on every DDL statement;
- a ransom-note database `readme_to_recover`.

Check the old production database for the same kind of persistence **before** it is replaced. Save the output as evidence. All queries below only read catalogs.

```bash
DC exec -T postgres psql -U postgres -d postgres -X -A -F ' | ' -f - < audit.sql > audit-old-$(date -u +%Y%m%dT%H%M%SZ).txt
```

`audit.sql`:

```sql
-- 1. Roles: anything besides postgres (and the built-in pg_* roles) is unexpected. Look for superuser/login roles such as priv_esc.
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls, rolvaliduntil
FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY rolname;

-- 1b. Who holds powerful built-in roles (server program execution, file access, all data).
SELECT r.rolname AS member, g.rolname AS granted_role
FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member JOIN pg_roles g ON g.oid = m.roleid
WHERE g.rolname IN ('pg_execute_server_program', 'pg_read_server_files', 'pg_write_server_files',
                    'pg_read_all_data', 'pg_write_all_data') OR g.rolsuper;

-- 2. Event triggers: none are expected (Hasura does not use them). log_start / log_end are the known backdoor.
SELECT evtname, evtevent, evtowner::regrole AS owner, evtfoid::regprocedure AS function, evtenabled
FROM pg_event_trigger;

-- 3. Functions outside the application schemas that do not belong to an extension.
--    Expected: public.set_current_timestamp_updated_at() only (from initdb.d). escalate_priv is the known backdoor.
SELECT n.nspname, p.oid::regprocedure AS function, pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'itap', 'itap_results', 'auth', 'storage', 'hdb_catalog')
  AND NOT EXISTS (SELECT 1 FROM pg_depend d
                  WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
ORDER BY 1, 2;

-- 3b. The known names, in any schema.
SELECT n.nspname, p.oid::regprocedure AS function
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname ILIKE '%escalate_priv%' OR p.prosrc ILIKE '%priv_esc%';

-- 4. Databases: expected postgres, template0, template1. A database named like readme_to_recover is the ransom note.
SELECT datname, pg_get_userbyid(datdba) AS owner, datallowconn FROM pg_database ORDER BY datname;

-- 5. Extensions: expected citext, pgcrypto, plpgsql, vector. postgres_fdw / dblink / file_fdw / adminpack are unexpected.
SELECT extname, extversion, extnamespace::regnamespace AS schema FROM pg_extension ORDER BY extname;

-- 6. Foreign servers and user mappings (exfiltration channels): none expected.
SELECT fdwname FROM pg_foreign_data_wrapper;
SELECT srvname, srvoptions FROM pg_foreign_server;
SELECT srvname, usename, umoptions FROM pg_user_mappings;

-- 7. Settings persisted with ALTER SYSTEM, and preload / archive hooks (command execution).
SELECT sourcefile, name, setting, applied FROM pg_file_settings WHERE sourcefile LIKE '%postgresql.auto.conf';
SELECT name, setting FROM pg_settings
WHERE name IN ('shared_preload_libraries', 'session_preload_libraries', 'local_preload_libraries',
               'archive_mode', 'archive_command', 'restore_command', 'listen_addresses', 'log_statement');

-- 8. Authentication rules in effect (trust from non-local addresses is a finding).
SELECT line_number, type, database, user_name, address, auth_method FROM pg_hba_file_rules;

-- 9. Schemas, and tables / triggers in public (none expected besides extension objects).
SELECT nspname, pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname !~ '^pg_' ORDER BY 1;
SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'f', 'p');
SELECT event_object_table, trigger_name, action_statement FROM information_schema.triggers
WHERE event_object_schema = 'public';

-- 10. Who is connected right now.
SELECT usename, datname, application_name, client_addr, backend_start, state, left(query, 80) AS query
FROM pg_stat_activity WHERE datname IS NOT NULL ORDER BY backend_start;
```

**Clean baseline.** This is what the rebuilt dev volume returned on 2026-10-20:
- roles: `postgres` only;
- no event triggers;
- databases: `postgres`, `template0`, `template1`;
- extensions: `citext`, `pgcrypto`, `plpgsql`, `vector`;
- one non-extension function in `public` (`set_current_timestamp_updated_at`);
- schemas: `auth`, `hdb_catalog`, `itap`, `itap_results`, `public`, `storage`;
- no foreign servers.

Dev also mounts a `trust` `pg_hba` file on purpose, because its port is published on 127.0.0.1 only. Production uses the image default, so its `host` lines must show `scram-sha-256`.

An old production database may also show legacy schemas or tables from before slice 1; those are expected. Any role, event trigger, function, database, extension, foreign server or `trust` rule not explained above is a finding.

**If anything is found:**
- Keep the evidence file and the backup (step 5) offline.
- Assume the attacker could read everything in that database, including the old secrets (already rotated in step 2), and could run commands as the `postgres` OS user inside the container (`COPY ... PROGRAM` as superuser).
- Check the host too: unexpected listening ports (`ss -tlnp`), cron entries, `~/.ssh/authorized_keys`, unknown containers or images.
- The recreated database (step 6) does not carry the persistence over, because the volume is new and no dump of the old database is restored.

Only if the old database must keep running (for example during a rollback, step 11), remove the persistence in this order. The event triggers come first, because `escalate_priv` re-creates the role on every DDL statement. Use the function signature reported by query 3, and run the `OWNED BY` statements in every database:

```sql
DROP EVENT TRIGGER IF EXISTS log_start;
DROP EVENT TRIGGER IF EXISTS log_end;
DROP FUNCTION IF EXISTS public.escalate_priv();
REASSIGN OWNED BY priv_esc TO postgres;
DROP OWNED BY priv_esc;
DROP ROLE IF EXISTS priv_esc;
DROP DATABASE IF EXISTS readme_to_recover;      -- after the evidence is saved
DROP EXTENSION IF EXISTS postgres_fdw CASCADE;  -- only if found and not deliberately used
ALTER ROLE postgres PASSWORD '<new POSTGRES_PASSWORD>';
```

## 5. Backup of the old stack

Everything in this step runs with the **current (old) `.env.prod`**: `DC` and `make prod-down` must address the old project. `.env.prod.new` is not used yet.

```bash
mkdir -p backup
git rev-parse HEAD > backup/old-commit.txt                       # the commit the old stack runs
cp .env.prod backup/old.env.prod                                 # the OLD env: leaked secrets, keep encrypted, offline
DC exec -T postgres pg_dumpall -U postgres > backup/old-pg_dumpall.sql
docker volume ls --format '{{.Name}}' | grep -E '_(pgdata|minio)$' > backup/old-volumes.txt
make prod-down                                                    # old env -> stops the old stack, keeps its volumes
docker run --rm -v <old project>_minio:/data:ro -v "$PWD/backup":/backup alpine tar czf /backup/old-minio.tgz -C /data .
docker run --rm -v <old project>_pgdata:/data:ro -v "$PWD/backup":/backup alpine tar czf /backup/old-pgdata.tgz -C /data .
```

Encrypt the `backup/` directory and move it off the web server.
- The dump is for evidence and rollback only, and it contains the attacker's objects if step 4 found any. Never restore it into the new stack.
- The old volumes are **not** deleted here. The new stack gets new volumes through the new `COMPOSE_PROJECT_NAME`.

## 6. Recreate the database and storage

The old stack is down and its env is in the backup (step 5); only now the new env takes the place of `.env.prod`:

```bash
git fetch && git checkout <release commit>                       # compose changes (step 3) are committed in the release
mv .env.prod.new .env.prod                                       # new secrets (step 2) and the new COMPOSE_PROJECT_NAME
grep -q '^COMPOSE_PROJECT_NAME=' .env.prod && ! cmp -s .env.prod backup/old.env.prod && echo new env in place
DC build backend frontend insightface stream-server
DC up -d postgres minio graphql auth storage
DC ps                                                            # wait until postgres, graphql, auth, storage are healthy
```

- The new project name gives fresh `pgdata` and `minio` volumes. Postgres initialises with the new `POSTGRES_PASSWORD` and runs `initdb.d` (schemas `auth` / `storage`, `pgcrypto`, `citext`).
- hasura-auth and hasura-storage create their own schemas and tables on start (`POSTGRES_MIGRATIONS_CONNECTION`, `POSTGRES_MIGRATIONS: '1'`). The data-layer migrations reference `auth.users` and `storage.files`, so **both must be healthy before step 7**. The compose `migrate` service depends only on `graphql`, so it must not race them: do not start it with the first `up`.
- Run the audit queries of step 4 against the new database and compare with the clean baseline. Save the result as `audit-new-*.txt`.

## 7. Apply migrations and metadata

`make hasura_apply` is the **dev** target: it runs `hasura-cli` in the `console` service of `docker/docker-compose.dev.yml`. On the server, the equivalent is the prod `migrate` service. It runs `hasura-cli migrate apply --database-name default` and then `hasura-cli metadata apply` against `http://graphql:8080`, with the project mounted from `apps/nhost/nhost` and the admin secret taken from the environment:

```bash
DC run --rm migrate
DC run --rm --entrypoint hasura-cli migrate migrate status --database-name default --endpoint http://graphql:8080 | tail -3
DC run --rm --entrypoint hasura-cli migrate metadata inconsistency list --endpoint http://graphql:8080
```

Expected:
- 346 migrations applied, the last being `1792365700270_orphan_sweep_in_use`;
- no metadata inconsistencies;
- 24 cron triggers, 9 event triggers and 21 actions (step 9).

Never hand-edit the generated metadata. If it must change, edit `apps/nhost/metadata-src`, run `pnpm --filter nhost metadata:generate`, commit, and apply again.

Start the rest of the stack:

```bash
make prod            # up -d for every service; migrate runs once more and finds nothing to apply
DC ps                # insightface needs up to ~3 min (start_period 180 s) before the backend starts
```

## 8. Seed on the server

The seed is TypeScript (`apps/backend/src/seed`, run with `tsx`). It runs inside the backend container, which carries the sources, the face assets (`apps/backend/seed-assets`) and the workspace dependencies. There it reaches Hasura (`http://graphql:8080`), storage (`http://storage:5000`) and InsightFace over the internal network.

```bash
DC exec -e SEED_PASSWORD='<seed password>' backend pnpm seed
```

- **Fresh database:** no `--reset` is needed. The run takes about 6 minutes; the 30-day history replay is most of it. Every seed step is idempotent, so a second `pnpm seed` writes nothing. `--reset` re-creates the demo organizations; use it only to start over.
- **Face-auth keys:** with `NODE_ENV=production` the log shows only the key prefixes (`Face auth: key issued for <app>: key=<prefix> (secret not printed in production)`). Get a usable secret with `rotate_client_key` in the console (step 10).
- **Webhooks:** `WEBHOOK_SINK_ENABLED` is false, so the seed creates no webhook subscription to the dev sink.
- **Cameras:** the seeded cameras have `recognition_enabled = false`.
- **Fallback:** if `tsx` is missing from the image, run the seed from a checkout on the server host. Set `apps/backend/.env` to the prod values, and use an SSH tunnel or a temporary 127.0.0.1 publish of graphql / storage / insightface.

## 9. Cron and event webhook URLs

Every Hasura-to-backend call is a template resolved inside the `graphql` container:

| Kind | Count | URL | Auth header |
|---|---|---|---|
| Actions (`actions.yaml`) | 21 | `{{BACKEND_URL}}/hasura/actions/<action>` | `x-action-secret` = env `ACTION_SECRET` |
| Event triggers (table metadata) | 9: `detection_created`, `send_delivery`, `send_webhook`, `render_report`, `run_bulk_job`, `policy_urgent_epoch_bumped`, `run_sync`, `run_export`, `fulfil_dsr` | `{{BACKEND_URL}}/hasura/events/<trigger>` | same |
| Cron triggers (`cron_triggers.yaml`) | 24: `aggregate_stats`, `close_stale_sessions`, `device_health_check`, `drain_file_deletions`, `dsr_maintenance`, `end_emergency_overrides`, `escalate`, `evaluate_dwell_rules`, `evaluate_segments`, `evaluate_segments_pending`, `expire_auth_sessions`, `heartbeat`, `lifecycle_jobs`, `purge_trigger_logs`, `resume_bulk_jobs`, `retention_cleanup`, `retry_deliveries`, `retry_webhooks`, `run_export_definitions`, `run_integration_schedules`, `run_report_schedules`, `run_saved_searches`, `send_digests`, `sync_terminal_policies` | `{{BACKEND_URL}}/hasura/events/<cron>` | same |

`BACKEND_URL` on `graphql` is `http://backend:${BACKEND_PORT:-3001}`, the internal network, not the public `${API_URL}`. Checks:

```bash
DC exec graphql sh -c 'test -n "$BACKEND_URL" && test -n "$ACTION_SECRET" && echo env ok'
DC exec graphql curl -s -o /dev/null -w '%{http_code}\n' "http://backend:3001/health"                  # 200
DC exec graphql curl -s -o /dev/null -w '%{http_code}\n' -X POST "http://backend:3001/hasura/events/heartbeat"  # non-2xx: no secret
```

Hasura creates the cron schedule rows on metadata apply. The first deliveries of the 1-minute crons appear within a minute (`hdb_catalog.hdb_cron_events`, status `delivered`).

## 10. Verification checklist

Run as the seeded Nova Tower admin:
1. Sign in through hasura-auth (`https://${AUTH_URL}/v1/signin/email-password`, `nova.admin@itap.demo`).
2. Call the action `switch_organization(organization_id)` for "Nova Tower Business Center" to get the org token (role `org_admin`).
3. Send the GraphQL calls below to `https://${GRAPHQL_URL}/v1/graphql` with that token.

- [ ] **Containers and audit**
  - [ ] `DC ps`: every service healthy (insightface, backend, graphql, auth, storage, postgres).
  - [ ] The step 6 audit of the new database matches the clean baseline.
- [ ] **Health**
  - [ ] `https://${API_URL}/health` returns 200.
  - [ ] `query { get_system_status { status checks postgres crons queues retention scopes } }` returns `status` `ok`. Every entry of `checks` is `ok`: Hasura `/healthz`, Postgres, InsightFace `/info` (with the model name), storage `/healthz`, stream-server `/health`. A check is `degraded` above 1 s latency and `down` when unreachable.
  - [ ] `scopes` says `checks` / `postgres` / `crons` are platform-wide and `queues` / `retention` are organization-scoped.
- [ ] **Cron lag** (`get_system_status.crons`; wait at least 15 minutes after step 7 so the 15-minute crons have run)
  - [ ] Every trigger is `ok`. Lag is the age of the oldest undelivered run that was due more than 2 minutes ago: `degraded` above 5 minutes or with errors in 24 h, `down` above 1 hour.
  - [ ] The daily crons have no run before the first night: `lifecycle_jobs` 03:00 UTC, `retention_cleanup` and `purge_trigger_logs` 03:30 UTC. Re-check them the next morning.
  - [ ] SQL cross-check: `SELECT trigger_name, max(scheduled_time) FILTER (WHERE status = 'delivered'), count(*) FILTER (WHERE status = 'error') FROM hdb_catalog.hdb_cron_events GROUP BY 1 ORDER BY 1;`
- [ ] **Seed result**
  - [ ] Nova Tower has profiles, devices, 30 days of detections / events / incidents, access decisions, reports with files, and the compliance data: retention policies, 2 active legal holds, processing activities, 5 DSRs, HR / SIEM / BMS integrations with BMS in `error` (expected demo state), export definitions with jobs.
  - [ ] `queues` show no growing backlog.
- [ ] **One end-to-end detection** (needs `RECOGNITION_ENABLED` not `false` and the stream-server serving `lobby`)
  1. `mutation { recognition_start(device_id: "<Nova lobby camera id>") { ... } }`.
  2. Within a minute, `recognition_status(device_id)` reports processed frames, and new `detections` rows of that device appear.
  3. Their `detection_created` deliveries are processed: `hdb_catalog.event_log` rows with `delivered = true`, plus a `tracking_sessions` row and the session-opened event in `events`.
  4. `recognition_stop(device_id)`. Live recognition grows the database, so keep the test short.
- [ ] **Face-auth health**
  - [ ] `https://${API_URL}/v1/auth/health` returns `{"status":"ok","checks":{"database":"ok","face_service":"ok"}}`, and `GET /v1/auth/openapi.json` answers.
  - [ ] Optional: `rotate_client_key(application_id: <Lobby Kiosk>)` returns a secret once. A signed `POST /v1/auth/sessions` (signing per `face-auth-api.md`) is accepted. A 503 `service_not_configured` means `AUTH_KEY_ENCRYPTION_KEY` did not reach the backend.
- [ ] **Retention dry-run plan.** Run `query { retention_plan(args: {}) { data_class facility_id action retain_days cutoff candidates held } }`.
  - [ ] There is one row per policy target: the seed's 21 organization-wide policies plus one facility-specific detections policy.
  - [ ] Right after the seed, `candidates` is 0 in every class. Seeded policies keep at least 31 days, and the seed test asserts the same invariant.
  - [ ] Do **not** call `run_retention` by hand: the `retention_cleanup` cron runs it at 03:30 UTC.
  - [ ] The next morning, the newest `retention_runs` row for the organization is `completed` with no class error, and `pending_file_deletions` is empty or draining (`drain_file_deletions` every 10 minutes).
- [ ] **Exposure** (from a machine outside the server)
  - [ ] Only the edge proxy answers.
  - [ ] Postgres 5432, MinIO 9000 and InsightFace 18080 are unreachable.
  - [ ] With step 3 applied: `https://${GRAPHQL_URL}/v1/metadata`, `/v2/query` and `/console` are not routed, and neither is `https://${API_URL}/hasura/events/heartbeat`.

## 11. Rollback

Prefer a forward fix:
- A failed migration stops at that version and can be re-run after the fix. Migrations are applied per version.
- A failed seed can be re-run (idempotent) or re-created with `pnpm seed --reset`.

To return to the old stack (time-boxed; the old secrets are leaked):

```bash
make prod-down                                   # still the NEW .env.prod: stops the new stack (its volumes stay)
mv .env.prod .env.prod.new                       # keep the new env (encrypted) for a later forward attempt
git checkout "$(cat backup/old-commit.txt)"
cp backup/old.env.prod .env.prod                 # the OLD env: old COMPOSE_PROJECT_NAME -> the old, untouched volumes
make prod                                        # old stack on its old volumes
```

The order matters: `make prod-down` must run while `.env.prod` is still the new file (otherwise it addresses the old project, which is already stopped, and the new stack keeps running).

- If step 4 found persistence, remove it (step 4 SQL) **before** the old stack takes traffic again.
- Rotate what can be rotated without data changes: the admin secret, the action secret and the JWT key (sessions are invalidated), and the Postgres password via `ALTER ROLE`.
- If the old volumes were lost, restore them from `old-pgdata.tgz` / `old-minio.tgz` into empty volumes of the old project name. Never restore the dump into the new stack.
- Remove the old volumes (`docker volume rm <old project>_pgdata <old project>_minio`) only after the new stack has been accepted and the evidence is archived.

## 12. After the cutover (owner)

- Watch the first night's `retention_cleanup`, `lifecycle_jobs` and `purge_trigger_logs` runs (step 10).
- Keep `AUTH_KEY_ENCRYPTION_KEY` with the other secrets. Losing it makes every client key and integration secret unusable.
- On the **dev** server, check the unrelated NoMachine `nxd` daemon listening on `0.0.0.0:4000`. It is not part of this stack; restrict it or stop it.
- The remaining owner actions and known limits are in `summary.md`.
