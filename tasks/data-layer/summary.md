# ITAP data layer: final summary (slices 1-10)

The data layer of the ITAP demo is built on branch `feat/data-layer-foundation` (not merged to `main`; production untouched):
- Postgres 16 with pgvector 0.8, under Hasura v2.46 (through Nhost auth and storage), plus an Express/TypeScript backend for everything Hasura cannot do;
- 346 migrations (`apps/nhost/nhost/migrations/default`);
- generated metadata (`apps/nhost/metadata-src` -> `pnpm --filter nhost metadata:generate`; auth / storage / actions hand-edited);
- a backend in `apps/backend/src`.

**Documents:**
- Binding spec: `design.md` (as built).
- Conventions: `.claude/rules/hasura-conventions.md`.
- Order of work: `roadmap.md`.
- Per slice: a plan, a summary and the rulings (`plan-NN-*.md`, `summary-NN-*.md`, `rulings-NN-*.md`).
- Integrator doc for face auth: `face-auth-api.md`.
- Production cutover: `prod-cutover.md`.

## What the data layer contains

### Foundation (slice 1, `summary-01-foundation.md`)
- **Tenancy:** organizations, settings, members (roles `user` and `org_admin`), invitations, user settings. Isolation is declarative, with composite tenant foreign keys everywhere.
- **Two-token flow:** a Nhost base token, then an org token from the `switch_organization` action (15 min, `org_admin` only).
- **Storage:** one bucket per organization through hasura-storage. Sensitive file kinds are never selectable and are read only through the audited `open_file`.
- **Audit:** `audit_log` with the reusable `itap.audit_row_change` trigger (secrets redacted, personal entities private).
- **Tooling:**
  - the metadata generator (TableSpec / FunctionSpec / CronSpec / EventTriggerSpec; it enforces composite FKs and covering indexes);
  - the actions router (`admin` / `actor` / `asCaller` clients);
  - the integration test harness with its fixture registry;
  - the ordered, idempotent seed (`pnpm seed`, `--reset`).

### Identity and profile (slice 2, `summary-02-identity-profile.md`)
- **Records:** companies, work schedules, profiles (types, statuses, custom attributes validated against definitions), documents, consents.
- **Identities:** photos, embeddings (pgvector), relationships, duplicate candidates, verification requests.
- **Merges** with exact rollback (`merge_identities`, `rollback_merge`, `split_identity`, `merge_profiles`).
- **Numbering:** human-readable codes via `itap.assign_number`.
- **Matching:** `match_face`, an exact cosine scan scoped by session (no HNSW).
- **Enrollment:** the actions `enroll_face`, `create_identity_from_photos` and `add_identity_photos` run on a shared enrollment service (InsightFace REST, quality checks, crops, duplicate check, no duplicates created).
- **Consent:** withdrawn biometric consent disables matching.
- **Removed:** the legacy TypeORM, REST routes, face-api.js, TensorFlow and Redis.

### Facilities and devices (slice 3, `summary-03-facilities-devices.md`)
- **Places:** facilities; an area tree (materialised path, multi-parent move guard, same-facility composite FKs); floor plans; access points; facility templates (`apply_facility_template`).
- **Devices:** cameras bound to stream-server ids, terminals and sensors, with device / area / access-point bindings.
- **Telemetry:** device health metrics and device events, written by `record_device_health`.
- **Backend:** the Hasura events router (`/hasura/events/<name>`, secret header, idempotency key) and the first crons (`heartbeat`, `device_health_check`).

### Detections, tracking, events, incidents, recognition (slice 4, `summary-04-detections-events.md`)
**Detection pipeline:**
- **Stage A** (SQL trigger in the insert transaction): sessions, locations, occupancy, identity counters, visit linking.
- **Stage B** (event trigger `detection_created` -> `itap.evaluate_detection`): state-change events with dedup keys, then `emit_event` / `finish_events`, which add rules, severity and incidents.

Around it:
- Versioned event rules, incidents with notes, activities and handovers, watch lists (blacklist / VIP / watch), visits, operator workspaces.
- Crons: `close_stale_sessions`, `evaluate_dwell_rules`, `lifecycle_jobs`, `purge_trigger_logs`.
- Live recognition (`src/recognition`): stream-server snapshots -> InsightFace -> `match_face` -> detections, pushed over Socket.io. Actions `recognition_start` / `recognition_stop` / `recognition_status`; `RECOGNITION_ENABLED` is the kill switch.

### Notifications (slice 5, `summary-05-notifications.md`)
- **Stage C fan-out** in SQL at the end of `finish_events`: notification rules, recipient groups, escalation policies with on-call schedules, personal subscriptions, the in-app inbox.
- **Deliveries:** lease-based sending (email log-only, sms / push stubs) with retries and dead letters, digests, quiet hours.
- **Webhooks:** HMAC-signed, SSRF-guarded, with backoff. A dev sink runs only with `WEBHOOK_SINK_ENABLED`.
- **Escalation:** the cron `escalate`.
- **Reporting:** `delivery_report`.

### Segments (slice 6, `summary-06-segments.md`)
- Manual and dynamic segments over identities or profiles.
- The field catalog (`segment_fields`) is the single source; the one evaluator is the backend translator (conditions -> Hasura `where`) followed by `itap.sync_segment_members`.
- The membership history is closed, never deleted.
- Activity stats, debounced re-evaluation (`segment_evaluation_requests` + `evaluate_segments_pending`), the hourly `evaluate_segments`.
- Segment scopes in event rules and notification conditions (membership as of the event time); the dry run `test_notification_rule`.
- Console computed fields (UI phase 7): `segment_members.opened_now` (the row was inserted by the current transaction, so `add_segment_members`' answer tells the memberships it opened from those already open; migration `1792365700283`) and `profiles.full_name` (`itap.profile_full_name`: first and last name joined, NULL when blank; what pickers, relation cells and record titles show and search; migration `1792365700284`).
- Dashboard console fields (UI phase 8): `dashboards.owned_by_me` (`itap.dashboard_owned_by_me`, session: the console offers edit/delete only on the user's own dashboards) and `dashboards.is_default` (the owner's landing dashboard; one per owner in an organization, `dashboards_one_default_key`; setting it clears the previous default via `dashboards_single_default`); migration `1792365700285`.
- Report console field (UI phase 8): `reports.requested_by_me` (`itap.report_requested_by_me`, session: the member's own reports, for the console's "Mine" view and its lost-answer check of "New report"); migration `1792365700286`.
- Integration console field (UI phase 12): `integrations.has_secret` (`itap.integration_has_secret`: whether a secret is stored; the secret itself stays write-only, set or cleared only by `set_integration_secret`), so the console shows "set" / "not set" and offers "Clear secret" only when one is stored; migration `1792365700287`.

### Analytics, reports, search, bulk, dashboards (slice 7, `summary-07-analytics.md`)
- **Stats:** hourly / daily / transition tables (`aggregate_stats`, trailing window) and query functions (`facility_occupancy_now`, `occupancy_series`, `flow_matrix`, `dashboard_kpis`, `identity_timeline`), plus `abnormal_movement`.
- **Reports:** `compute_report` in SQL; in-house CSV / JSON / PDF / XLSX renderers; lease / attempt fencing; schedules.
- **Search:** facial and attribute search (`search_identities` plus the shared `searchService`) and saved searches with alerts.
- **Bulk jobs:** imports, updates and bulk search, applied row by row as the owner, resumable.
- **Dashboards:** a widget contract.
- **Seed:** a 30-day history with stats.

### Physical access (slice 8, `summary-08-physical-access.md`)
- **Policies:** versioned access policies with four-eyes approval; grants (single-use consumed centrally); emergency overrides.
- **Decisions:** the single engine `itap.evaluate_access` / `check_access` (deterministic order, risk score, full trace, p95 about 1.3 ms), with append-only `access_decisions`.
- **Detection pipeline:** face-credential doors and tailgating in Stage B; per-area governance for `restricted_area_entry`.
- **Terminals:** policy epochs with urgent and lazy terminal sync (stub transport, cron plus event trigger); simulation; policy analytics.

### Face authentication service (slice 9, `summary-09-face-auth.md`, `face-auth-api.md`)
- **Clients:** client applications with bound populations, modes and attributes; HMAC keys (scrypt fingerprint plus a secret encrypted under `AUTH_KEY_ENCRYPTION_KEY`).
- **Records:** sessions and append-only attempts; identity centroids.
- **Decisions in SQL:** population, threshold floor, quality, attack and replay checks, two-stage match, review, second factor.
- **REST `/v1/auth/*`** with OpenAPI 3.1, console actions, the cron `expire_auth_sessions`.
- **Seed:** 5 apps, 20 synthetic identities, 30 days of attempts.

### Compliance (slice 10, `summary-10-compliance.md`)
- **Retention:** policies over 21 data classes, executed daily by `retention_cleanup` through one purge function per class. Purges are batched, resumable, FK-ordered, legal-hold aware, and bypass guards only under `itap.retention_context`. Files go through the `pending_file_deletions` queue; the dry-run planner is `retention_plan`. Face source photos (kind `face_source`, uploaded by the console for the enrollment actions) are queued by the `drain_file_deletions` cron once older than an hour, whatever the outcome (`itap.enqueue_stale_face_sources`, UI phase 4 final wave), and with their crop (`metadata.source_file_id`) by `enqueue_unused_files` (retention, erasure).
- **Legal holds:** on identities, profiles, incidents and facilities, following the person graph and merges.
- **Restriction of processing:** excluded from matching, auth, search, segments and stats; suppressed in recognition and enrollment.
- **Data subject requests** (`fulfil_dsr`, lease fenced):
  - access / portability bundles;
  - erasure with a tombstone, structural matching and partial erasure under holds;
  - restriction;
  - rectification;
  - overdue events.
- **Records of processing** with DPIA files.
- **Integrations:** a real HR fixture sync with erased-person suppression; SIEM and BMS stubs.
- **Exports:** run as the requester with a keyset cursor; owner-only, sensitive files.
- **Status:** the action `get_system_status`.

## How to run, seed and test

```bash
pnpm install
cp .env.example .env.dev                     # fill secrets (ACTION_SECRET, AUTH_KEY_ENCRYPTION_KEY: openssl rand -hex 32)
make dev-compose                             # postgres, hasura, auth, storage + minio, backend, insightface, stream-server, traefik (127.0.0.1 only)
make hasura_apply                            # migrations + metadata (make db_reset for a clean itap schema; dev only)
pnpm seed                                    # demo data; --reset re-creates it
pnpm --filter nhost metadata:generate        # after changing apps/nhost/metadata-src
pnpm lint && pnpm typecheck && pnpm build    # gates
pnpm --filter backend exec vitest run src    # backend unit tests (never watch mode)
pnpm --filter nhost test                     # metadata generator tests
pnpm --filter backend test:integration       # integration tests against the running dev stack
RUN_SEED_TEST=1 pnpm --filter backend exec vitest run -c vitest.integration.config.ts tests/integration/seed.test.ts
pnpm --filter backend test:cleanup           # remove test leftovers
```

**Seed:**
- Two organizations: Nova Tower Business Center (main) and Riverside Office Park.
- Users `admin@itap.demo`, `nova.admin@itap.demo`, `riverside.admin@itap.demo` and `operator@itap.demo`, all with `SEED_PASSWORD`.
- The seed needs InsightFace and the stream-server.
- **Timing:** `pnpm seed --reset` takes about **6 minutes** (355 s in the last run). The 30-day history replay through the real pipeline is most of it. A repeated `pnpm seed` is idempotent and writes nothing.
- In dev, the seed log prints the face-auth demo keys once (prefix only in production).

**Test counts** (latest full runs):
- **Integration:** 164 files (1 skipped), **1056 passed / 12 skipped**, 0 failed (about 11 minutes).
- **Backend unit:** 532 tests (78 files).
- **Metadata generator:** 100 tests (9 files).
- **Seed test:** 12 tests.

## Owner actions

1. **Rotate every secret** before anything non-dev uses them:
   - the Hasura admin secret (dev default `change-me`);
   - the Postgres password;
   - **the JWT key**: the old key is in git history (6 commits of `apps/backend/.env`, 2 of the root `.env`);
   - the action / events secret (`ACTION_SECRET`);
   - the MinIO root credentials.

   Treat all dev values as leaked: the dev database was public with trust auth in February 2026.
2. **Set a production `AUTH_KEY_ENCRYPTION_KEY`** (64 hex). Without it:
   - the keyed face-auth routes answer 503;
   - `rotate_client_key` and `set_integration_secret` refuse;
   - the seed stores no keys.

   Never change it afterwards without re-issuing every client key and integration secret.
3. **InsightFace CPU:** the prod compose sets `cpus: 4.0` (needed for the face-auth p95 of 2 s). Make sure the host has the cores.
4. **Webhook flags:** `WEBHOOK_SINK_ENABLED=false` and `WEBHOOK_ALLOW_PRIVATE_TARGETS=false` in production. Both are already hard-coded in the prod compose; verify them.
5. **Production backdoor audit:** run the read-only queries in `prod-cutover.md` §4 against the production Postgres before replacing it. They look for:
   - unexpected superuser roles such as `priv_esc`;
   - event triggers `log_start` / `log_end`;
   - functions like `escalate_priv`;
   - a database like `readme_to_recover`;
   - extensions like `postgres_fdw`.
6. **Compose hardening and decisions** (`prod-cutover.md` §3):
   - the Hasura route limited to `/v1/graphql`, console off, CORS restricted;
   - backend `/hasura/*` not public;
   - TLS in front of `/v1/auth/*` with exactly one proxy hop (`trust proxy 1`);
   - decide on `RECOGNITION_ENABLED`.
7. **Dev server:** check the unrelated NoMachine `nxd` listening on `0.0.0.0:4000`.
8. **Merge and cut over:** merge the branch (nothing is merged) and run the cutover (`prod-cutover.md`): the database and storage are recreated, then migrations, metadata and the seed run on the server.
9. **Out of the data layer's scope:**
    - the admin UI (`apps/admin-ui`) does not work against the new schema and waits for its rebuild (design §10);
    - real email / SMS / push providers, real HR / SIEM / BMS connectors and a real terminal transport are stubs;
    - face-auth client libraries and capture kits should be generated from the OpenAPI document.

## Known limits across slices

Details and the remaining deferred minors are in each slice summary.

- **Platform and security (1):**
  - The action secret comparison leaks its length.
  - Mapping SQL `RAISE` codes relies on `HASURA_GRAPHQL_ADMIN_INTERNAL_ERRORS=true`.
  - hasura-storage writes file metadata as admin, so sensitive kinds are hidden from select rather than refused at upload.
  - The org-logos bucket is shared, and its metadata is visible to every org_admin.
  - The dev backend container uses the host's `node_modules`.
- **Identity (2):**
  - Consent records are editable, including their dates (demo shortcut).
  - `rollback_merge` does not restore verification requests cancelled by the merge.
  - Enrollment writes go through the admin `actor` client (organization scoping by the service and by triggers).
  - The rights to some seed fixture photos are uncertain (`seed-assets/faces/NOTICE`).
- **Devices (3):**
  - Non-stream devices have a stale `last_seen_at`.
  - The health cron bumps `devices.updated_at` every minute.
- **Recognition and tracking (4):**
  - About 0.3 fps per camera on CPU InsightFace; small lobby faces can split into duplicate identities.
  - `occupancy_exceeded` uses the live count at evaluation.
  - Profile deactivation at 03:00 UTC lags west of UTC.
- **Notifications (5):**
  - Email is log-only and SMS / push are stubs.
  - `send_delivery` also fires for in-app rows (one no-op backend call each).
  - Stage C uses `now()` while escalation uses the scheduled time.
- **Segments (6):**
  - Watch-list expiry is picked up only hourly.
  - A transaction writing inputs of two organizations could rarely deadlock at commit.
  - Daily stats scan all membership rows.
  - Every unknown-identity insert requests an organization evaluation (debounced to once a minute).
- **Analytics (7):**
  - Sessions closed after the trailing window lose their exit until `aggregate_stats_range` runs.
  - Report deliveries bypass quiet hours and digests.
  - Missed schedule runs are not all replayed.
  - PDF / XLSX output is simple.
  - Facility-local daily stats are exact only when the timezones match.
  - Each facial saved-search run calls InsightFace again.
- **Physical access (8):**
  - Risk components (occupancy, device health) are read as of now even for a past time.
  - `check_access` records the decision and consumes single-use grants (no dry run; use `simulate_access_policy`).
  - Four-eyes approval does not cover the definitions of referenced segments.
  - The terminal payload is computed per terminal; the transport is a stub.
- **Face auth (9):**
  - Liveness is a cheap heuristic.
  - Access-point narrowing does not meet 50 000 identities in 2 s.
  - The rate limit, replay cache and `last_used_at` throttle live in process memory.
  - Rotating the encryption key invalidates the stored keys.
  - Synthetic identities exist only through the seed.
- **Compliance (10):**
  - Exports: rows committed late behind the keyset cursor are never exported; `audit_log` export subject tracking covers only rows about profiles / identities. (Reports, export jobs and DSR bundles in flight at erasure time are fenced: they are retried or rejected, never attached.)
  - Retention: the `export_jobs` hold predicate ignores held incidents / facilities; `dsr_export` bundles have no retention class; replaced HR fixtures are not swept; a big organization's continuation restarts the classes the next day.
  - DSR erasure: free text is redacted by exact terms only; the member's own user account is out of DSR scope.
  - Holds are evaluated at `now()`.
  - Erasure is one transaction (not batched).
  - Seed times are not back-dated for the BMS failures and the DSR steps.
  - `organization_settings.default_retention_days` is unused (no policy means keep).
- **Seed:**
  - Some invariants are date-dependent (slice-9 lobby after-hours attempts, the slice-8 turnstile gallery occupancy).
  - Recovering from an interrupted seed needs `--reset`.
