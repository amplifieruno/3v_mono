# Slice 2 summary: Identity and profile

Branch `feat/data-layer-foundation` (commits `608ee4d..HEAD`, 11 commits). Spec: `design.md`; plan: `plan-02-identity-profile.md`.

## What was built

**Tables (migrations `1792365500000`..`030`)**
- Numbering: `organization_counters`. Companies: `companies` (+ kind/status enums), `work_schedules`.
- Profiles: `profiles` (+ type/status/access-level enums), `custom_attribute_definitions` (+ entity/type enums), `profile_documents` (+ kinds), `consent_records` (+ purpose/status/method enums), `profile_duplicate_candidates`.
- Identities: `identities` (+ status/source enums), `identity_photos` (+ kinds), `identity_embeddings` (pgvector), `identity_relationships` (+ relation enum), `identity_duplicate_candidates` (+ candidate statuses), `verification_requests` (+ statuses), `identity_merges`, `identity_merge_sources`, `identity_merge_moves` (+ merge statuses).
- Result type `itap_results.face_matches`.

**SQL functions / triggers**
- `itap.assign_number(entity)` (per-org counter; `code` is a generated column such as `PROFILE-00001`), `itap.in_windows(windows, tz, ts)`.
- Tracked: `match_face` (pgvector cosine search), `merge_identities`, `rollback_merge`, `split_identity`, `approve_verification`, `reject_verification`, `merge_profiles`.
- Computed field `profiles.has_face`; `profiles.identities_count` maintained by trigger.
- Consent effect: `biometric_consent_allows` / `apply_biometric_consent` trigger set `matching_enabled` of linked identities from the latest `biometric_processing` consent record.
- Reserved identity values (status `merged`, sources `merge`/`split`) guarded by the transaction-local flag `itap.merge_context`.

**Actions** (`apps/backend/src/actions/`): `upload_profile_document`, `enroll_face`, `create_identity_from_photos`, `add_identity_photos`. Logic lives in `apps/backend/src/face/enrollmentService.ts` (`enrollForProfile`, `createIdentityFromImages`, `addPhotosToIdentity`), shared by handlers and the seed; InsightFace REST client, quality checks and crops in `src/face/`.

**Generator features** (`apps/nhost/metadata-src`, `scripts/`): `computedFields`, `functions` registry (`FunctionSpec`: exposedAs, sessionArgument, customName, roles; fails on an undeclared `json hasura_session`, introspects input args only). FK and covering-index enforcement already existed from slice 1.

**Legacy removal**: TypeORM services, REST routes, recognition manager, face-api.js/TensorFlow/Redis code removed from the backend.

**Seed** (`pnpm seed`): companies, profiles with attributes/documents/consents, and enrolled faces. Faces come from committed assets (`apps/backend/seed-assets/faces`, built by `src/seed/tools/extract-faces.ts`: extraction + clustering over stream-server videos and InsightFace test images); most profiles have no face.

## Rulings (from the ledger)

- T6 structures enrollment as a service module used by action handlers and the seed - cost: none.
- `is_blacklisted` computed field arrives with watch lists in slice 4 (spec 6.4 depends on 6.9) - cost: none.
- T2: fold minors (definitions entity/key insert-only, `source_integration_id` read-only until the slice 10 FK, `is_valid_date` STABLE, `mergeRoles` keeps computed_fields) into the fix round - cost: small.
- Security: the dev Postgres contains database `readme_to_recover` (ransom note, 2026-02-16); not touched (evidence), dev secrets treated as leaked. Public 5432 publish removed from `docker-compose.prod.yml` (compose network only) - cost if wrong: prod DB admins need an SSH tunnel.
- T3 carry into T4: reserve identity status `merged` and sources merge/split via trigger unless `itap.merge_context`; merging unlinks sources from their profile; primary flag cleared on profile move; profile-delete cascade test; template lock order by uuid; generator fails on undeclared session argument; introspection uses input args only; raw `embedding` excluded from org_admin select - cost: Task 4 grows.
- T4: prod `POSTGRES_DEV_INSECURE` is ignored by the pgvector image (scram auth) - harmless, left; dev mounts a trust pg_hba, localhost-only.
- T4: fold minors 1-6 (merge cancels sources' pending verification requests; candidate status update limited to open/dismissed; verification requests editable only while pending; approving archived/suspended identity -> `identity_not_verifiable`; split filters by identity_id; raise_code search_path; target-already-linked test) - cost: small.
- T5: withdrawn consent follows the person through a profile merge (privacy-conservative); no profile-merge table (inactive profile + audit `merge`); actions router body limit 16 MB (secret check precedes parsing).
- T8: seed faces = reproducible extraction + clustering over stream-server videos (Pexels) + InsightFace test images (Apache-2.0), assets <= 5 MB; most profiles without faces.
- T8 (to final wave): the blacklisted demo persona must not be a real identifiable person in a negative light - neutral label ("watch-list demo"), no incident narrative; NOTICE in seed-assets with sources and note that real faces get fictional names; `lumia.jpg` rights uncertain (InsightFace-REST test asset).
- T8 note: false-blacklist risk (a person close to a blacklisted face) - slice 4 recognition threshold decision (~0.4).

## Deviations from plan-02

- Plan defined enrollment only as action handlers; the seed needed the logic, so a shared service module was added.
- Task 3 (matching) was extended with the merge-context reservation, embedding column privacy and generator safety checks (items #1-#8 from review).
- `identity_merge_sources.previous_status` column added (needed by rollback, not in the plan table list).
- Task 4 also removed the public 5432 publish from the prod compose file.
- `is_blacklisted` computed field deferred to slice 4.
- Fix rounds: T2 (1 round), T4 (1 round).

## Deferred minors (for the final review to triage)

- T1: `assign_number` keeps an explicit number without advancing the counter (document / GREATEST); counter lock ordering note; windows entry shape not validated (slice 3: `itap.valid_windows(jsonb)` CHECK, apply to `work_schedules` too); no DST test; misleading test comments.
- T2: options elements not required to be strings; null-on-optional / JSON-null-required not asserted.
- T4: rollback does not restore verification requests the merge cancelled.
- T5: `merge_profiles` closes (source, X) candidates as `merged` (should dismiss/repoint); target status not checked / no primary promotion; link trigger overrides manual `matching_enabled=false`; consent records editable incl. dates (demo shortcut, document); deleting a `profile_documents` row orphans the file (`delete_file` is the path).
- T6: intra-request photo consistency (reject non-matching photos when target has templates); concurrent enroll primary race -> map unique violation to `identity_conflict`; `runSqlRows` 'NULL' comment; LINK not in the photo transaction; LINK where lacks org/status guard; primary lookup ignores status; addPhotos can land on a just-merged identity (SQL guard needed); matching-disabled identities invisible to duplicate check (document); missing tests for crop cleanup and merged `identity_not_active`.
- T7: Dockerfile `pnpm build; exit 0` masks errors; eslint legacy override block stale; `app.ts` stale comment; tsconfig decorator flags; `STARTUP.md` / `start-project.sh` stale (Redis/TypeORM) - delete or update.
- T8: blacklisted/no-consent enrolled visitor consent story; approve retry skip; `cameraIdentity` hardcoded status; extract tool reproducibility (video hashes) and move out of `src`; plan note for `SeedResults` shape.
- Final wave: demo-persona and asset licensing items above.

## Owner actions (not done by the agents)

- **Security**: a ransom-note database `readme_to_recover` was found in dev Postgres (dev DB was reachable publicly in Feb with trust auth). Treat all dev secrets as leaked (rotate `JWT_SECRET`, Hasura admin secret, Postgres password) and check prod for the same note.
- The old Hasura JWT key is in git history (`apps/backend/.env`) and equals the current dev key: rotate before any non-dev use.
- The prod 5432 publish was removed in the repo only: redeploy prod to take effect (ensure Hasura/backend use the compose network; admins need an SSH tunnel).
- Prod env still needs `ACTION_SECRET`, `HASURA_JWT_SECRET`, `NHOST_STORAGE_URL` (slice 1) and the InsightFace service reachable from the backend.
- Nothing is merged to `main`; production untouched.

## How to run

```bash
make dev-compose                       # infra incl. backend + insightface containers
make hasura_apply                      # migrations + metadata
pnpm seed                              # orgs, users, companies, profiles, enrolled faces (needs insightface up)
pnpm seed -- --reset                   # wipe seed data first
pnpm --filter backend exec tsx src/seed/tools/extract-faces.ts   # regenerate seed face assets (rarely)
pnpm --filter nhost metadata:generate  # after changing metadata-src
pnpm --filter backend test:integration
```
