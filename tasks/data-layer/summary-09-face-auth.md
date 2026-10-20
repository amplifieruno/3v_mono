# Slice 9 summary: Face authentication service (SA_6)

Branch `feat/data-layer-foundation`: commits `95d910b..HEAD` (Task 1 `c3388bf`..`fa498d1`, Task 2 `21e14f5`..`3e6f323`, Task 3 `564b849`..`e7a052f`, Task 4 `7678a8a`..`4a13557`, Task 5 docs/gates). Spec: `design.md` §6.16, §7, §8.1, §8.3, §8.5 (as built); plan: `plan-09-face-auth.md`. Migrations 187-207. Integrator doc: `face-auth-api.md`; machine-readable interface: `GET /v1/auth/openapi.json` (OpenAPI 3.1).

## What was built

### Task 1: schema (migrations 187-193, fix round 194-196)
- Enums (modes, attributes, steps, outcomes, review statuses, failure reasons, attack outcomes, session statuses); `client_applications` (`APP-xxxxx`, thresholds with CHECK `0 <= min <= threshold <= max <= 1`, `is_sandbox` insert-only, `revoked` terminal) and junctions for modes, attributes, segments, facilities, access points (`sandbox_population_check`: sandbox apps bind no locations).
- `client_application_keys` (8-character global prefix, `secret_hash` scrypt fingerprint, expiry, revocation; at most 2 active keys per app; written only by `store_client_key`, revoked once by `revoke_client_key`).
- `authentication_sessions` (nonce_hash, `claimed_ref_hash`, step, recapture count 0..2, status open/review/succeeded/failed/expired, terminal-state guard), `authentication_attempts` (append-only, spec columns plus session, attempt_no, evidence file, sequence digest, attack details, quality, retrieval/comparison ms, review columns), `auth_sequence_digests` (replay guard), `itap.review_authentication_attempt` (org_admin; pending partial matches only).
- `identity_centroids` (l2-normalized mean of the templates, trigger-maintained), synthetic identity guards (never linked to profiles, never merged with production identities, `is_synthetic` immutable), `match_face` excludes synthetic identities.
- Slice 8 carry: the 13 deferred `access_credentials_*` triggers renamed `zz_access_credentials_*` so they sort after `segment_inputs_changed*`.

### Task 2: decision engine (198-202)
- `itap.auth_population` / `auth_population_scope` (one evaluator `auth_population_eval`), `auth_threshold_floor`, `auth_effective_threshold`, `auth_attributes`, `itap.auth_decide` (validation, population, replay digest, quality, attack, liveness, two-stage match: top-20 centroids then best template, partial band `[t-0.08, t)`), review events, `search_identities` excludes synthetic identities.
- Population is always server-side and linked to an ACTIVE profile (sandbox: synthetic identities). Nothing in a request widens it or lowers a threshold.

### Task 3: service (203-205)
- Backend `apps/backend/src/auth-service/`: HMAC key auth, replay cache, per-key token bucket, session open, authenticate, recapture, second factor, session status, health, OpenAPI 3.1; actions `rotate_client_key` and `authenticate_face` (console path); cron `expire_auth_sessions` with the evidence sweep. Key secrets stored AES-256-GCM encrypted (`AUTH_KEY_ENCRYPTION_KEY`, AAD = key prefix, format `v2`) next to the scrypt fingerprint.
- Service SQL entry points are admin-only and always decide at DB `now()`: `auth_open_session`, `auth_service_decide`, `auth_second_factor`, `auth_session_state`, `expire_auth_sessions`; public projections `itap_results.auth_decisions`, `auth_session_states`.

### Task 4: seed (206-207)
- Five apps (Lobby Kiosk, HR Portal, Visitor Check-in, Developer Sandbox, Legacy Badge Kiosk suspended), 20 synthetic identities (pixel blends of two seed crops plus mirror), keys (history key revoked after rotation, current key printed once in dev, an expired pilot key), 30 days of history through the real engine via `itap.seed_auth_flow` (555 sessions, 667 attempts, 10 reviews, 8 evidence frames, 410 `auth_success` / 97 `auth_failed` events). `itap.auth_now()` is the seed-only back-dating clock. Seed +15-18 s (full reset ~300 s).
- `run_lifecycle_jobs` skips synthetic identities.

## Rulings (from the ledger)
- Facility-bound population: profiles with a published policy or active grant covering the facility, or identities with a tracking session there in the last 30 days; amended: only identities linked to an ACTIVE profile ever authenticate (unlinked camera identities never). Sandbox population = synthetic identities (they cannot link to profiles).
- Client libraries and mobile capture kits are not data-layer work: this slice ships the OpenAPI 3.1 interface and developer doc (follow-up).
- Event types `auth_success` / `auth_failed` already existed (verified).
- Evidence files use the existing sensitive kind `auth_capture` (audited via `open_file`, hidden from storage selects) instead of a new readable kind. Failure reasons `attack_detected` and `second_factor_failed` added. Synthetic/production merge guard accepted. Review approval emits `auth_success`, rejection `auth_failed`.
- Access point narrowing via `evaluate_access(p_record false)`; floor beats `threshold_max`; verification outside the population is indistinguishable from `below_threshold` in the response.
- Extras accepted: inactive-profile identities excluded, `p_evidence_file`, rejection emits `auth_failed`. Liveness: `liveness_required` and attack outcome `not_checked` -> `liveness_failed`. Session binds claimed identity and access point strictly; sandbox apps emit no events; `retrieval_hit` NULL for out-of-population claims; archived segments ignored.
- HMAC auth needs the secret server-side: AES-256-GCM encrypted copy under `AUTH_KEY_ENCRYPTION_KEY` (prod value is an owner action).
- Latency: insightface `cpus: 4.0`; all frames in one `/extract` call kept (faster than the 2-best-frames split, keeps pairwise liveness). Timeout default 5000 ms accepted (FS default).
- Second factor only on verification sessions (identification partial: recapture -> review); `session_id` on every error with a known session; replay cache 600 s over (prefix, signature); `X-Request-Id`, when sent, is part of the signature; header check before the body; success evidence deleted, orphans swept; claimed ids hashed as canonical lowercase uuid, malformed claims follow the unknown-id path; `authenticate_face` refuses sensitive kinds.
- Seed prints demo plaintext keys once (dev only; prefix only when `NODE_ENV=production`); lifecycle skips synthetic identities.

## Deviations from spec
- §6.16 columns/tables beyond the spec: sessions, attempt columns (session_id, attempt_no, evidence_file_id, sequence_digest, attack_details, quality, stage timings, review fields), `auth_sequence_digests`, `identity_centroids`, `client_application_keys.secret` and `claimed_ref_hash`, failure reasons `attack_detected`, `second_factor_failed`; evidence kind `auth_capture` (not `auth_evidence`); attempt image column is `evidence_file_id`.
- Client libraries and mobile capture kits: replaced by OpenAPI plus doc.
- Second factor is verification only; the service asserts the result (`asserted_by: application`).
- Request `timeout_ms` default 5000 (max 10000), not 3000.
- All frames embedded in one call (not the 2 best frames).
- `screen_replay` and `mask` attack outcomes exist in the enum but the service never produces them; `liveness_failed` has no live producer other than `not_checked` with `liveness_required`.

## Performance
- `auth_decide` on seeded Nova: p50 8 ms, p95 ~17 ms (stage 1 and 2 about 0.1 ms each).
- Boundary (20 identification successes, 3 frames, insightface `cpus: 4.0`): p50 242-258 ms, p95 ~274 ms (InsightFace p95 220 ms, rest 62 ms). Before the CPU change: p95 2.2 s.
- Rate limit 30 burst / 10 per second per key (per process).

## Deferred minors and known limits
- Liveness is a cheap heuristic (a perfectly still live person may be flagged `printed_photo`; screens are not told from prints; masks never).
- Verification requests repeat `claimed_identity_id` on every capture (session keeps only a hash).
- Rate limit, replay cache and `last_used_at` throttle are per process (in memory).
- Rotating `AUTH_KEY_ENCRYPTION_KEY` invalidates stored keys (no re-encryption tool); `v1` rows must be rotated.
- Seed: reviewed_at and audit dates are back-dated; Visitor population is one identity; no seeded rule routes `auth_failed` attack events yet.
- Search (slice 7) excludes synthetic identities for everyone.

## Pending final-wave carries
- Evidence sweep: catch per-file delete errors (a 404 means already deleted) so one file cannot stop a run.
- Replay window should be `2 * skew + 1` s (600 s now covers it only by coincidence of constants); record the replay entry only after the revoked / expired / rate-limit checks.
- Migration 205 down comment: needs an empty key table.
- OpenAPI note: sign the trimmed `X-Request-Id` (documented in `face-auth-api.md`).
- Seed a notification rule routing `auth_failed` attacks to the Security team; enrol more visitors for Visitor Check-in.

## Slice 10 purge list (retention / DSR)
`authentication_attempts`, `authentication_sessions`, `auth_sequence_digests`, evidence files of kind `auth_capture`, revoked/expired `client_application_keys`, sandbox applications and synthetic identities; DSR erasure must null `matched_identity_id` / `claimed_identity_id` / `profile_id` on attempts and delete the evidence file.

## Owner actions
- Set `AUTH_KEY_ENCRYPTION_KEY` (64 hex characters) in prod `.env` before enabling the service; without it keyed routes answer 503 `service_not_configured` and rotation is refused. Never change it afterwards without re-issuing every key.
- Prod compose: insightface `cpus: 4.0` (set in the file; check the host has the cores).
- Rotate secrets as part of cutover (no secret was rotated in this slice); run the prod audit before exposing `/v1/auth/*` (terminate TLS and set `trust proxy` hops accordingly: the app uses `trust proxy 1`).
- Mobile/web capture kits and client libraries: generate from the OpenAPI document.

## How to run
- `make dev-compose`, `make hasura_apply`, `pnpm seed` (needs insightface and `AUTH_KEY_ENCRYPTION_KEY` in `apps/backend/.env`; `--reset` re-creates everything).
- Seed log lines `Face auth: demo key for <app> (shown once, dev only): key=<prefix> secret=<secret>` give the keys (shown only when a key is issued, i.e. on first seed or after `--reset`). Create more keys in the console with `rotate_client_key`.
- Sign a request: see `face-auth-api.md` (canonical string `METHOD\nPATH\nTS\nsha256(body)[\nX-Request-Id]`, HMAC-SHA256 with the secret, header `Authorization: ITAP-HMAC key=<prefix>, ts=<unix>, sig=<hex>`). Backend at `http://127.0.0.1:3001/v1/auth/...`.
- Tests: `pnpm --filter backend exec vitest run src`, `pnpm --filter nhost test`, `pnpm --filter backend test:integration`, seed test `RUN_SEED_TEST=1 pnpm --filter backend exec vitest run -c vitest.integration.config.ts tests/integration/seed.test.ts`.
