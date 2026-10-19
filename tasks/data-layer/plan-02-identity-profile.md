# Data Layer Slice 2 — Identity & Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Companies, work schedules, profiles, identities with embeddings/photos, identity lifecycle (relationships, duplicates, merges with rollback, split, verification), profile documents/consents/custom attributes/duplicates, face matching in SQL, enrollment actions backed by InsightFace — and removal of the legacy TypeORM/REST backend.

**Architecture:** Builds on slice 1 (`tasks/data-layer/summary-01-foundation.md`): migrations in `apps/nhost/nhost/migrations/default`, table metadata generated from `apps/nhost/metadata-src`, backend Actions in `apps/backend/src/actions` (ctx `admin` for reads, `actor` for writes), integration tests against the running compose stack. Multi-step atomic logic (merge, rollback, split, template upkeep, approvals) lives in volatile SQL functions tracked as Hasura mutations with a `hasura_session` argument; the backend does only what needs InsightFace or Storage.

**Tech Stack:** Postgres 16 + pgvector 0.8, Hasura v2.46, InsightFace-REST (`/extract`, compose service `insightface`), sharp, Express/TypeScript, vitest.

**Spec:** `tasks/data-layer/design.md` — read §4.1, §6.0, §6.2 (companies, work_schedules), §6.3, §6.4, §7, §8.0, §8.1 before starting.

## Global Constraints

- Everything in slice 1 Global Constraints (`plan-01-foundation.md`) still applies (tenancy, composite FKs, NO ACTION, indexes, enum tables with `description`, timestamps, generator-owned metadata, no `any`, ≤300-line files, migrations with down.sql).
- Codes: `number bigint` per organization per table assigned by trigger from `itap.organization_counters` via `INSERT … ON CONFLICT DO UPDATE … RETURNING`; `code text GENERATED ALWAYS AS (<PREFIX> || '-' || lpad(number::text, 5, '0')) STORED`, unique per org. Prefixes this slice: identities `IDENTITY`, profiles `PROFILE`.
- File columns (`*_file_id`) reference `storage.files` and carry `itap.check_file_bucket(...)` triggers.
- Embeddings: `vector(512)`; matching by **exact scan** (no HNSW) over templates of identities with `matching_enabled` and status not in (`merged`,`archived`), cosine distance, threshold from `organization_settings.recognition_threshold` (default 0.5 distance).
- At most 5 templates per identity (top-5 by `quality_score`); stored embeddings are never overwritten.
- Tracked functions: every function takes `hasura_session json` (session argument) and scopes by `x-hasura-organization-id`; results via tables in `itap_results` with `organization_id` and the standard filter; permissions granted explicitly (INFER is off).
- Audit: every new business table gets `itap.audit_row_change(...)` except high-volume/ro tables listed in spec §8.1; embeddings are excluded from audit diffs (`ignore:` or not audited).
- Window JSON shape (spec §6.0): `[{days:[1..7], from:'HH:MM', to:'HH:MM'}]`; `itap.in_windows(windows jsonb, tz text, ts timestamptz) returns boolean` immutable-safe (stable).
- Carried from slice 1 (see `summary-01-foundation.md`, `.claude/rules/hasura-conventions.md`): the generator now rejects tenant FKs without `organization_id` and FK column sets without a covering index (leading `organization_id`) — create those indexes in every migration; reverse 1:1 relationships are objects; org tokens have allowed roles `["org_admin"]` only; integration tests use `expectDenied(promise, field | PERMISSION_CHECK)` and the fixture registry (auto cleanup — register every org/user/file a test creates); action handlers write through `actor`, audit `entity` = table name.
- Deferred from slice 1, fold into Task 5: org-logos uploads must be raster images only (`image/png`, `image/jpeg`, `image/webp`), no `image/svg+xml`.

## Review Focus

1. Merging identities that belong to different profiles: a reasonable admin expects a clear refusal (`merge_profile_conflict`) unless the target has no profile, never a silent re-link.
2. Rolling back a merge after new detections/photos were attached to the target: rollback must move back exactly the rows recorded in `identity_merge_moves` and leave newer rows on the target.
3. Enrolling the same face twice for the same profile: no duplicate identity; the second call adds photos/templates to the existing identity (or reports it as duplicate of another profile's identity with `duplicate_identity` and the matched code).
4. Withdrawing biometric consent then re-granting it: matching is disabled on withdrawal and re-enabled on re-grant (embeddings were not yet deleted).
5. A profile in org A must never match a face enrolled in org B (`match_face` scoped by session org even when called with the admin secret plus forwarded headers).

---

### Task 1: Numbering, codes, windows helper, companies, work schedules

**Files:**
- Create migrations: `…_create_organization_counters` (`itap.organization_counters (organization_id, entity text, last_value bigint, primary key (organization_id, entity))` FK CASCADE; function `itap.assign_number()` trigger: `TG_ARGV[0]` = entity key; sets `NEW.number` via upsert-returning when null), `…_create_in_windows` (`itap.in_windows(jsonb, text, timestamptz)`), `…_create_company_enums` (`itap.company_kinds`: tenant, contractor_vendor, service_provider, visitor_org; `itap.company_statuses`: active, inactive), `…_create_companies` (spec §6.2 columns + audit trigger), `…_create_work_schedules` (name, timezone, windows jsonb, description; CHECK windows is a JSON array; audit trigger)
- Create: `apps/nhost/metadata-src/companies.ts` (register in index.ts); `organization_counters` spec profile `none`
- Test: `apps/backend/tests/integration/companies.test.ts`, `apps/backend/tests/integration/in-windows.test.ts` (run_sql `select itap.in_windows(...)` cases)

**Interfaces:**
- Produces: `itap.assign_number()` used as `CREATE TRIGGER number BEFORE INSERT ON itap.<t> FOR EACH ROW EXECUTE FUNCTION itap.assign_number('<entity>')`; `itap.in_windows(windows, tz, ts)`; tables `companies`, `work_schedules`.

- [ ] **Step 1: Failing tests:** in_windows: Monday 09:30 Europe/Moscow inside `[{days:[1],from:'09:00',to:'18:00'}]` → true; Sunday → false; overnight window `from:'22:00', to:'06:00'` covers 02:00 next day → true; empty array → false. Companies: org_admin CRUD isolated per org (filtered results), audit row on insert. Counters: two concurrent inserts into a numbered scratch table (run_sql) in the same org get distinct consecutive numbers; another org starts at 1.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement; `pnpm --filter nhost metadata:generate && make hasura_apply`. **Step 4:** run → PASS.
- [ ] **Step 5: Commit** — `feat(hasura): Add numbering, schedule windows, companies and work schedules`

---

### Task 2: Profiles and custom attributes

**Files:**
- Create migrations: `…_create_profile_enums` (`profile_types`: employee, visitor, contractor, vip; `profile_statuses`: active, inactive, suspended, terminated; `access_levels`: basic, standard, elevated, admin), `…_create_custom_attribute_definitions` (spec §6.4; `entity` enum `custom_attribute_entities`: profile, identity, facility, device; `data_type` enum `custom_attribute_types`: string, number, boolean, date, enum; unique (organization_id, entity, key)), `…_create_validate_custom_fields` (`itap.validate_custom_fields()` trigger: `TG_ARGV[0]` = entity; for active definitions checks required keys present, value types match `data_type`, enum values within `options`; unknown keys rejected; raises `check_violation` `custom_field_invalid:<key>`), `…_create_profiles` (spec §6.4 columns incl. number/code PROFILE, company_id composite FK, work_schedule_id composite FK, avatar_file_id + check_file_bucket, `source_integration_id uuid` nullable without FK (integrations arrive in slice 10 — add the FK then), `external_id`, `identities_count int not null default 0` **ro**, custom_fields default '{}'; audit trigger; validate_custom_fields('profile'))
- Create: `apps/nhost/metadata-src/profiles.ts`; computed field `has_face` (SQL function `itap.profile_has_face(profiles) returns boolean` = identities_count > 0) added via `extraPermissions`/computed-field support in the generator — if the generator lacks computed-field support, add a `computedFields` option to TableSpec with a unit test (name, function, select-permitted for org_admin).
- Test: `apps/backend/tests/integration/profiles.test.ts`

**Interfaces:**
- Produces: `itap.validate_custom_fields(entity)`; tables `profiles`, `custom_attribute_definitions`; generator `computedFields?: { name: string; function: string; }[]` (included in select columns for permitted roles).

- [ ] **Step 1: Failing tests:** profile insert gets `code = 'PROFILE-00001'` then `00002`; `has_face` false on new profile; custom field required missing → `custom_field_invalid:<key>`; wrong type → same; enum outside options → same; company from org B → composite FK error; org isolation (filtered results); `identities_count` not writable by org_admin.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5: Commit** — `feat(hasura): Add profiles and custom attribute definitions`

---

### Task 3: Identities, photos, embeddings, matching

**Files:**
- Create migrations: `…_create_identity_enums` (`identity_statuses`: unverified, pending_verification, verified, suspended, archived, merged; `identity_sources`: camera, enrollment, manual, import, merge, split; `identity_photo_kinds`: capture, enrollment, manual), `…_create_identities` (spec §6.3; number/code IDENTITY; profile_id composite FK SET NULL (profile_id); linked_by member FK; counters ro; `matching_enabled bool not null default true` ro; `is_synthetic bool default false`; primary_photo_file_id + check_file_bucket; audit with `ignore:` for last_seen_at, detection_count, first_seen_at, confidence), `…_create_identity_photos` (CASCADE from identity; device_id uuid nullable without FK until slice 3 — add FK there; file check), `…_create_identity_embeddings` (vector(512) not null, quality_score real, model_version text, source_detection_id uuid (no FK; log link), photo_file_id, is_template bool default false ro; CASCADE; not audited), `…_create_identity_counters` (trigger maintaining `profiles.identities_count` on identity insert/delete/profile_id change, and profile_id link sets linked_at), `…_create_template_upkeep` (`itap.refresh_templates(p_identity_id uuid)`: marks top-5 by quality_score as templates; trigger after insert/delete on identity_embeddings calls it), `…_create_match_face` (result table `itap_results.face_matches (organization_id uuid, identity_id uuid, profile_id uuid, distance real, similarity real)` (no rows stored; `similarity = 1 - distance`); function `itap.match_face(hasura_session json, p_embedding text, p_threshold real default null, p_limit int default 5) RETURNS SETOF itap_results.face_matches` STABLE: org from session, threshold default from organization_settings, exact scan over templates of eligible identities, order by distance)
- Create: `apps/nhost/metadata-src/identities.ts` (+ `itap_results.face_matches` spec; the generator must support `itap_results` tables and a function tracking spec — if functions are not yet supported, add `functions?: FunctionSpec[]` to the registry: `{ name, schema, exposedAs: 'query'|'mutation', sessionArgument: 'hasura_session', roles: string[] }` writing `metadata/databases/default/functions/*.yaml` + `functions.yaml` include, with unit tests)
- Test: `apps/backend/tests/integration/identities.test.ts`, `apps/backend/tests/integration/match-face.test.ts`

**Interfaces:**
- Produces: tables `identities`, `identity_photos`, `identity_embeddings`; `itap.refresh_templates(uuid)`; `itap.match_face(...)` exposed as query `match_face(args: {p_embedding, p_threshold, p_limit})` for role `org_admin` (search UI later) and admin; generator `functions` support.

- [ ] **Step 1: Failing tests:** identity code assigned; linking identity to profile increments `identities_count` and sets `has_face`; unlinking decrements; inserting 7 embeddings marks exactly 5 templates (highest quality); match_face with an embedding equal to a stored template returns that identity with distance≈0; same embedding queried with an org B token returns nothing (Review Focus 5); identities with `matching_enabled=false` or status `merged` are excluded; threshold respected.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5: Commit** — `feat(hasura): Add identities, embeddings and SQL face matching`

---

### Task 4: Identity lifecycle — relationships, duplicates, verification, merge, rollback, split

**Files:**
- Create migrations: `…_create_identity_relationships` (ordered pair CHECK identity_a_id < identity_b_id, unique pair; relation enum `identity_relations`: companion, related, other), `…_create_identity_duplicate_candidates` (ordered pair, unique, similarity, status enum `candidate_statuses`: open, merged, dismissed; status the only writable column), `…_create_verification_requests` (spec §6.3; status enum `verification_statuses`: pending, approved, rejected, cancelled; member FKs), `…_create_identity_merges` (`identity_merges`, `identity_merge_sources (merge_id, source_identity_id)`, `identity_merge_moves (merge_id, entity text, row_id uuid, from_identity_id uuid)`; merge status enum `merge_statuses`: completed, rolled_back), `…_create_identity_lifecycle_functions`:
  - `itap.merge_identities(hasura_session json, p_target uuid, p_sources uuid[], p_reason text) RETURNS SETOF itap.identity_merges` — all ids in session org; sources ≠ target; refuse when a source and target link different profiles (`merge_profile_conflict`); moves photos and embeddings to the target recording each in `identity_merge_moves`; sets sources status `merged`; target inherits profile if it had none; refreshes templates; closes related duplicate candidates as `merged`; audit row `merge`.
  - `itap.rollback_merge(hasura_session json, p_merge_id uuid)` — moves back exactly the recorded rows; restores source statuses from the merge snapshot (store previous status per source in `identity_merge_sources.previous_status`); status `rolled_back`; audit `rollback`.
  - `itap.split_identity(hasura_session json, p_identity uuid, p_embedding_ids uuid[], p_photo_ids uuid[]) RETURNS SETOF itap.identities` — creates a new identity (source `split`, unverified) and moves the given rows.
  - `itap.approve_verification(hasura_session json, p_request uuid, p_reason text)` / `itap.reject_verification(...)` — pending only; approve sets identity `verified`; audit `approve`/`reject`.
- Create: specs in `apps/nhost/metadata-src/identities.ts` (functions exposed as mutations to `org_admin`)
- Test: `apps/backend/tests/integration/identity-lifecycle.test.ts`

**Interfaces:**
- Produces: GraphQL mutations `merge_identities`, `rollback_merge`, `split_identity`, `approve_verification`, `reject_verification` for org_admin.

- [ ] **Step 1: Failing tests:** merge two unlinked identities → sources `merged`, photos/embeddings on target, moves recorded, audit `merge` with caller; merge across different profiles → `merge_profile_conflict` (Review Focus 1); org B ids → error, no change; rollback restores rows and statuses while a photo added to the target after the merge stays on the target (Review Focus 2); split creates a new identity with only the chosen rows; approve sets verified, second approve → `verification_not_pending`; duplicate candidate pair (b,a) rejected by CHECK.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5: Commit** — `feat(hasura): Add identity merge, rollback, split and verification`

---

### Task 5: Profile documents, consents, profile duplicates and merge

**Files:**
- Create migrations: `…_create_profile_documents` (kind enum `profile_document_kinds`: id_card, contract, nda, badge_photo, other; file_id + check_file_bucket; CASCADE from profile), `…_create_consent_records` (purpose enum `consent_purposes`: biometric_processing, tracking, analytics, marketing; status enum `consent_statuses`: granted, withdrawn; method enum `consent_methods`: paper, electronic, verbal; document_file_id), `…_create_consent_effects` (trigger: latest `biometric_processing` record withdrawn → linked identities `matching_enabled=false`; granted → true (Review Focus 4)), `…_create_profile_duplicate_candidates` (ordered pair, similarity, reasons jsonb, status `candidate_statuses`), `…_create_merge_profiles` (`itap.merge_profiles(hasura_session json, p_target uuid, p_source uuid)` — moves identities, documents, consents to target, source status `inactive`, closes candidates, audit `merge`)
- Create: `apps/backend/src/actions/profileDocuments.ts` — Action `upload_profile_document(profile_id: uuid!, kind: String!, title: String!, file_name: String!, mime_type: String!, content_base64: String!): ProfileDocument!` → uploads via StorageClient into the org bucket with `metadata.kind='profile_document'`, inserts `profile_documents` via `actor`; returns `{ document_id, file_id }`; max 10 MB decoded
- Specs in `apps/nhost/metadata-src/profiles.ts`; actions.graphql/yaml
- Test: `apps/backend/tests/integration/profile-documents.test.ts`, `apps/backend/tests/integration/consents.test.ts`, unit test for the handler

**Interfaces:**
- Produces: tables `profile_documents`, `consent_records`, `profile_duplicate_candidates`; mutation `merge_profiles`; Action `upload_profile_document`.

- [ ] **Step 1: Failing tests:** upload_profile_document stores a file org_admin cannot select directly but can open via `open_file` (audited); profile from org B → `profile_not_found`; withdraw biometric consent → identity matching_enabled false and match_face no longer returns it; re-grant → true; merge_profiles moves identities and recomputes identities_count on both profiles.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5: Commit** — `feat(hasura): Add profile documents, consents and profile merge`

---

### Task 6: InsightFace client and enrollment actions

**Files:**
- Create: `apps/backend/src/face/insightFaceClient.ts` (`createInsightFaceClient(baseUrl: string): { extract(image: Buffer): Promise<ExtractedFace[]> }`, `type ExtractedFace = { bbox: [number, number, number, number]; score: number; embedding: number[]; age?: number; gender?: 'male' | 'female' }` — POST `/extract` with `{ images: { data: [base64] }, max_size: [640, 640], threshold: 0.6, extract_embedding: true, extract_ga: true }`; validates the 512-length embedding; no global single-flight lock — callers serialize), `apps/backend/src/face/crop.ts` (`cropFace(image: Buffer, bbox, size = 150): Promise<Buffer>` sharp JPEG with 20% margin), `apps/backend/src/face/quality.ts` (`qualityScore(face: ExtractedFace, imageWidth: number, imageHeight: number): number` 0..1 from detection score and face size — formula is the builder's)
- Create: `apps/backend/src/actions/enrollment.ts` — Actions:
  - `enroll_face(profile_id: uuid!, file_ids: [uuid!]!): EnrollmentResult!`
  - `create_identity_from_photos(file_ids: [uuid!]!, attributes: jsonb): EnrollmentResult!`
  - `add_identity_photos(identity_id: uuid!, file_ids: [uuid!]!): EnrollmentResult!`
  - `type EnrollmentResult { identity_id: uuid!, identity_code: String!, photos_added: Int!, templates: Int!, rejected: [RejectedPhoto!]! }`, `type RejectedPhoto { file_id: uuid!, reason: String! }` (reasons `no_face`, `multiple_faces`, `low_quality`)
  - Files must be in the session org bucket (`file_not_found` otherwise); processed **sequentially**; each accepted photo → crop uploaded (`metadata.kind='identity_photo'`), `identity_photos` + `identity_embeddings` rows via `actor`.
  - Duplicate check with `match_face` (forwarded session): `enroll_face` reuses the profile's primary identity, or a matched unlinked identity (links it), or creates one (source `enrollment`); a match to an identity linked to **another** profile → `ActionError('duplicate_identity', '<code>')` (Review Focus 3, FS §2.1); `create_identity_from_photos` with a match → `duplicate_identity`; `add_identity_photos` whose photo matches a different identity → photo rejected with `conflicting_identity` (FS §2.2 conflict surfaced).
  - Action timeout 120 s in actions.yaml.
- Modify: `apps/backend/src/config/env.ts` (`INSIGHTFACE_API_URL` required)
- Test fixtures: `apps/backend/tests/fixtures/faces/` — face images (licence-clean: crops from the stream-server sample videos, which are Pexels-licensed, and/or `libs/InsightFace-REST/misc/test_images/*` (Apache-2.0)); at least two distinct people and one image without a face.
- Test: unit tests for crop/quality/client parsing (stub fetch); `apps/backend/tests/integration/enrollment.test.ts` (requires `insightface` compose service)

**Interfaces:**
- Consumes: `match_face`, tables from Tasks 2–3, StorageClient (slice 1).
- Produces: `createInsightFaceClient`, `cropFace`, `qualityScore` (used by the slice-4 recognition port).

- [ ] **Step 1: Failing tests:** enroll person A's two photos for profile P → one identity, 2 photos, templates ≥1, `has_face` true; enroll the same photos again → same identity id, no new identity (Review Focus 3); enroll person A for profile Q → `duplicate_identity`; photo with no face → rejected `no_face`; file from org B → `file_not_found`; create_identity_from_photos(person B) → new unlinked identity with code.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5: Commit** — `feat(backend): Add InsightFace client and enrollment actions`

---

### Task 7: Remove the legacy backend

**Files:**
- Delete: `apps/backend/src/config/database.ts`, `src/entities/`, `src/services/identityService.ts`, `src/services/profileService.ts`, `src/services/insightFaceService.ts`, `src/routes/face.ts`, `src/routes/identities.ts`, `src/routes/profiles.ts`, `src/routes/auth.ts`, `src/scripts/` (TypeORM/face-api scripts), `scripts/download-models.sh`
- Modify: `apps/backend/src/index.ts` / `app.ts` (no TypeORM init; legacy recognition routes and manager disabled — keep `src/services/recognitionManager.ts` and `src/routes/recognition.ts` out of the app until the slice-4 port; delete them if they cannot compile without the removed services, and note it), `apps/backend/package.json` (remove typeorm, reflect-metadata, pg, face-api.js, @tensorflow*, canvas, redis, multer if unused, node-fetch, uuid if unused, migration:* scripts, download-models/setup/sync-db scripts; keep bcryptjs (seed), jsonwebtoken, sharp, socket.io, zod; declare `@eslint/js` and `typescript-eslint` devDependencies and drop redundant `@typescript-eslint/*`), `docker/docker-compose.dev.yml` / `prod.yml` (remove `DATABASE_URL` from backend if present)
- Test: existing unit + integration suites stay green; `pnpm --filter backend build` and `docker compose … up backend` healthy

- [ ] **Step 1:** Delete/modify as above.
- [ ] **Step 2: Verify:** `pnpm install && pnpm lint && pnpm typecheck && pnpm build && pnpm --filter backend exec vitest run src && pnpm --filter backend test:integration` → all exit 0; backend container healthy (`/health` 200).
- [ ] **Step 3: Commit** — `refactor(backend): Remove legacy TypeORM services and REST routes`

---

### Task 8: Seed — companies, people, faces

**Files:**
- Create: `apps/backend/src/seed/companies.ts`, `apps/backend/src/seed/people.ts`, `apps/backend/src/seed/faces.ts`; register steps in `src/seed/index.ts` (tighten `previous` typing so each step declares the results it requires)
- Create: `apps/backend/seed-assets/faces/` (licence-clean images: per-person folders for known people taken from stream-server video frames — extract with ffmpeg in the stream-server image or from `docker/stream-server/videos/*.mp4`; a manifest `manifest.json` mapping folder → role (`employee`/`vip`/`blacklisted`/`unknown`) and source/licence)

**Interfaces:**
- Produces: `seedCompanies`, `seedPeople` steps; `SeedResults` grows `companies: Record<string, string>`, `profiles: { all: string[]; byRole: Record<string, string[]> }`, `identities: string[]`.

Seed content (Nova Tower; Riverside gets a small subset):
- 10 tenant companies + 2 contractor/vendor + 1 service provider; work schedules: Office Day (Mon–Fri 08:00–20:00), Night Shift (daily 22:00–06:00), Security 24/7.
- Custom attribute definitions: profile `badge_number` (string, required for employees? — not required), `parking_spot` (string), `clearance_expires` (date), `shift` (enum day/night).
- ~150 profiles: employees across tenants (majority), contractors, visitors, 3 VIPs; deterministic names from a fixed list; consents (biometric granted for most, 2 withdrawn); a few documents (generated small PDFs) via `upload_profile_document` logic (StorageClient direct).
- Faces: every person in the manifest enrolled through the same code path as `enroll_face` (call the enrollment service functions directly, not via HTTP) so embeddings are real; `unknown` people become unlinked identities (`source = camera`); a few verification requests (pending/approved), 2 duplicate candidate pairs, 1 completed merge.
- Idempotent (keyed by deterministic names/codes) and covered by `--reset`.

- [ ] **Step 1: Failing test** (`seed.test.ts` extended): after seed, Nova Tower has ≥150 profiles, ≥12 companies, ≥10 identities with templates, at least one VIP with `has_face`, and `match_face` with a seeded template returns its identity; second run changes no counts.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5: Commit** — `feat(backend): Seed companies, profiles and enrolled faces`

---

### Task 9: Docs, summary, gates

**Files:**
- Modify: `CLAUDE.md` (backend stack after legacy removal), `tasks/data-layer/roadmap.md` (plan link), `.claude/rules/hasura-conventions.md` (numbering/code pattern, functions registry, computed fields)
- Create: `tasks/data-layer/summary-02-identity-profile.md` (from the ledger: built, rulings, deviations, deferred minors, owner actions)

- [ ] **Step 1:** Edit/create.
- [ ] **Step 2: Gates:** `pnpm lint && pnpm typecheck && pnpm build && pnpm --filter backend exec vitest run src && pnpm --filter nhost test && pnpm --filter backend test:integration` → all exit 0.
- [ ] **Step 3: Commit and push** the feature branch — `docs(docs): Document slice 2 identity and profile`.
