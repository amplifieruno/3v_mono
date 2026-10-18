# ITAP Data Layer — Design

Date: 2026-10-18
Status: draft v2 (after builder check and three review passes: coverage, Hasura/Postgres feasibility, modeling consistency)

## 1. Intent

ITAP is a demo of an identity tracking and access platform (`docs/base/*`, `docs/stages/SA_2..SA_6`). The admin UI will be rebuilt on burojs 0.5 once it is released. Before that, we build the **data layer**: the complete Hasura/Postgres model, permissions, and the server-side logic (SQL functions, triggers, crons, actions) that makes the platform behave.

The bar is **a logically correct, well-architected project** that a reviewer would recognise as a real platform's data layer, covering every entity in the docs and all stages. The UI is put on top afterwards; the data layer is the part that matters now.

Why: the demo will be clicked by the customer and recorded on video. Every screen in the docs must be able to look like it works, so the data behind it must exist, be related correctly, be produced by real logic where an action happens, and be populated with believable data.

## 2. Goals

1. Hasura schema covering every entity in the docs (≈85 tables, §6), with fields, types, constraints, indexes, relationships.
2. Multi-tenancy by **organization** from day one, enforced declaratively in the database and in Hasura (§4).
3. Permissions in Hasura metadata for the roles in §5, with no cross-organization path through tables, functions, actions, storage or audit.
4. Server-side logic that reacts to **real** events (camera detections, user actions) and periodic work (§8).
5. A seed producing a believable **office center** scenario (§9), files included, timestamps relative to seed time.
6. Live camera face recognition keeps working on the new schema (§7).
7. The UI calls everything through Hasura: CRUD, tracked SQL functions (queries and mutations), and Actions (backend) where an external service is involved.

## 3. Non-goals and anti-goals

**Non-goals (this phase):**
- Any UI work. The current admin-ui will break against the new schema; accepted (it gets replaced).
- Activity simulation. No background generator of events. Data comes from the seed and real actions (cameras, users). Consequently: estimated positions during camera gaps exist only in seeded history (no live estimator).
- Role differentiation inside an organization. One role (`org_admin`); schema ready for more (§5).
- Support portal, knowledge base, tickets, training, competency, test dashboards (SA_4). Possibly a separate app.
- Real email/SMS/push delivery, real HR/ERP/SIEM/BMS connectors, real SLA/cost monitoring, real liveness/anti-spoofing. Represented by data and stubbed handlers (§8.5).
- Multi-stage verification chains (single approval step), general (non-face-auth) API keys and rate limiting, evacuation roll-call records (evacuation view = live occupancy during an `evacuation` override).
- Platform super-admin UI. Organizations and members come from the seed.
- Keeping the existing 19 migrations or existing data (dev and prod DBs are recreated).

**Anti-goals (failure even if it "works"):**
- Tables with no relations or logic behind them. Every table is connected to the model, justified by a doc section, and either written by a user flow or by logic in §8.
- Cross-organization data leakage through any role, relationship, function, action, storage path or audit row.
- Breaking live recognition (cameras → identities → detections).
- Business logic in the UI. If a rule exists (segment membership, occupancy, escalation), it lives in the data layer.
- Bending the model to the UI framework (owner decision): relations are FKs and junction tables, not id arrays or ids inside JSON.

## 4. Tenancy, authentication, storage

### 4.1 Organizations and declarative isolation
- `itap.organizations` is the tenant. Every business table has `organization_id uuid not null`.
- Every business table has `UNIQUE (organization_id, id)`. **Every FK between business tables is composite**: `(organization_id, x_id) → parent(organization_id, id)`. The database therefore makes it impossible to reference another organization's row from any table, including sideways references and junctions. Where the deletion policy (§6.0) says SET NULL, it is `ON DELETE SET NULL (x_id)` (PG15+), so `organization_id` is never nulled.
- Exception: links **between high-volume log rows** (`events.detection_id`, `identity_locations.detection_id`, `notification_deliveries.event_id`, `webhook_deliveries.event_id`, `incident_events.event_id`, `search_results.search_request_id`) are plain indexed uuid columns without FK. Logs are written only by trusted SQL in the same organization, and retention then deletes logs without cascading row-by-row updates across other logs. Real FKs are kept to stable entities.
- `UNIQUE (organization_id, id)` exists only on tables something references.
- **Every FK column set is indexed** (leading with `organization_id`); Postgres doesn't do it automatically, and deletes/cascades depend on it.
- `organization_id` → `organizations(id)` itself: `ON DELETE CASCADE`.
- Same-facility consistency uses the same technique where it matters: `areas.parent_id`, `floor_plans.area_id`, `access_points.area_id/from_area_id`, `devices.area_id` carry `facility_id` in a composite FK `(organization_id, facility_id, x_id)`.
- File references (`*_file_id → storage.files`) cannot be composite; a trigger checks `storage.files.bucket_id = organization_id::text`.

### 4.2 Users and membership
- Users are Nhost `auth.users` (email + password). No duplicate user table.
- `user_settings` (1:1 with auth.users, cross-org personal preferences only): locale, timezone, last_organization_id. Anything that involves other people of an org (vacation delegate, quiet hours for escalations) lives on `organization_members`.
- `organization_members`: organization_id, user_id, role (enum, currently only `admin`), status (`active/suspended/deactivated`), title, department, joined_at, expires_at, deactivated_at, deactivated_by, quiet_hours (windows, §6.0), vacation_until, vacation_delegate_user_id (composite FK to a member of the same org). `UNIQUE (organization_id, user_id)`.
- **Every column referencing a user inside an org** (assignees, authors, approvers, recipients, owners, `created_by`) is a composite FK `(organization_id, user_col) → organization_members(organization_id, user_id)` (the workspace-member pattern): a user from another organization can never be assigned, notified or shown.
- **Members are never hard-deleted while referenced; they are deactivated.** FKs to members use `ON DELETE NO ACTION` (checked at statement end, so an organization cascade still removes members and their references in one statement; `RESTRICT` would fail there). History keeps resolving to the person ("deactivated").
- Trigger `active_member_check`: assignment/recipient columns may only be set to an `active` member (checked only when the column changes; existing references stay).
- On deactivation: the member can no longer switch into the org; their subscriptions and inbox stop receiving deliveries (rows kept); `vacation_delegate_user_id` receives escalations if set.
- Account removal (e.g. GDPR erasure of a platform user) = disable and anonymize the `auth.users` row, never delete it; `organization_members.user_id → auth.users` is `NO ACTION`.

### 4.3 Two-token flow (owner decision)
1. Login via Nhost → **base token**, role `user`: own `user_settings`, own memberships with organization name/logo, Action `switch_organization`.
2. `switch_organization(organization_id)` → backend checks an active membership and signs an **organization token** with the key and issuer from Hasura's `JWT_SECRET` (`HS256`, `iss: "hasura-auth"`, claims under `https://hasura.io/jwt/claims`):
   - `x-hasura-user-id`, `x-hasura-organization-id` (lowercase uuid text), `x-hasura-default-role` (`admin` → `org_admin`), `x-hasura-allowed-roles` = [`org_admin`, `user`].
3. TTL 15 min, renewed by calling the action again with the base token. Revocation effective within TTL. The switch is recorded in `audit_log` (`switch_org`).
4. The same token works with hasura-storage (it forwards the Authorization header to Hasura, which evaluates `storage.files` permissions). Verified by one upload test early in delivery.
5. Fix `apps/backend/.env` (malformed `HASURA_JWT_SECRET`, wrong `JWT_SECRET`); the signer parses `key` and `issuer` from the same JSON Hasura uses.

### 4.4 File storage
- **One Nhost Storage bucket per organization**, bucket id = organization id (text), created by trigger on `organizations` insert (`ON CONFLICT DO NOTHING`, reseed-safe).
- `storage.files` for `org_admin`: insert/select where `bucket_id = X-Hasura-Organization-Id`; **no delete** (deletes go through Action `delete_file`, which uses the storage API). Insert check rejects sensitive kinds (`metadata.kind in ('profile_document','dsr_export','auth_capture')`), so only backend Actions (`upload_profile_document`, DSR, auth) can create them; select excludes them. Sensitive files are opened through Action `open_file(file_id)` that returns a short-lived URL and writes `audit_log` `view_sensitive`.
- All crops, photos, documents, reports, exports go to the org bucket with `metadata.kind`.
- Organization logos live in a shared bucket `org-logos` (not sensitive), selectable by `user` and `org_admin`.
- Files are deleted only through the hasura-storage API (backend), never by deleting `storage.files` rows, so MinIO objects don't leak (retention, reset, org delete).

## 5. Roles

| Role | Who | Access |
|---|---|---|
| `public` | unauthenticated | nothing |
| `user` | logged in, no org selected | own `user_settings`, own `organization_members` (+ org name/logo), Action `switch_organization` |
| `org_admin` | admin of current org | CRUD within `organization_id = X-Hasura-Organization-Id`, except **ro** columns/tables and secret columns |
| backend | handlers, crons | admin secret **plus forwarded caller headers** (§8.0) |

Conventions for `org_admin`:
- select/update/delete filter `{organization_id: {_eq: X-Hasura-Organization-Id}}`; `allow_aggregations: true` on every select.
- insert presets: `organization_id = X-Hasura-Organization-Id`, `created_by = X-Hasura-User-Id`.
- **ro** columns (counters, computed state, timestamps, embeddings) excluded from insert/update; append-only logs select-only.
- **Secret columns** (device passwords, integration secrets, webhook secrets, key hashes, invitation token hashes) are writable but excluded from select via column permissions, and redacted from `audit_log`.

Future roles: SA_4 §2.1.4 six roles + FS scopes. Adding a role = enum value + Hasura role permissions + mapping in `switch_organization`. Facility ABAC would add an `organization_member_facilities` table and an `x-hasura-facility-ids` claim — additive, not built now.

## 6. Data model

Schema `itap`. Nhost `auth.*`, `storage.*` used as-is. Function result tables in schema `itap_results` (§8.1).

### 6.0 Conventions
- PK `id uuid default gen_random_uuid()`; `UNIQUE (organization_id, id)`; composite FKs (§4.1). Junction tables also carry `organization_id`.
- Codes (`IDENTITY-12345` etc., FS): `number bigint` per organization per table from `organization_counters` via `INSERT … ON CONFLICT DO UPDATE … RETURNING` (concurrency-safe); `code text GENERATED ALWAYS AS (prefix || lpad(number::text, 5, '0')) STORED`, unique per org, indexable and a flat column for the UI. On: identities, profiles, segments, facilities, devices, reports, notification_rules, incidents, access_policies, event_rules, client_applications, visits.
- `created_at`, `updated_at` (trigger) on every table (`updated_at` also drives burojs live updates); `created_by` where a human creates rows.
- Enums: Hasura enum tables `itap.<thing>_<kind>s (value text pk, description)`, lowercase snake values (matches docs; `.claude/rules/hasura-conventions.md` updated).
- Hasura enum tables can only have the key and one text column, so they are exempt from timestamps. **Ordered enums** (severity, profile access level, area access level, priority) get a rank via one immutable SQL function per scale (`severity_rank(text)` etc.); comparisons always go through it. Profile and area access levels keep their doc vocabularies but share one 1–4 rank scale, so "area level above profile clearance" is defined.
- Enum *sets* (a rule's channels, an app's modes and allowed attributes) are junction tables to the enum table, like any many-to-many (a CHECK cannot validate array elements against a table).
- Append-only tables (detections, locations, events, decisions, attempts, deliveries, audit, metrics) have `created_at` only, no `updated_at` trigger.
- **Time**: all timestamps `timestamptz`. Hourly buckets are UTC `timestamptz`; daily buckets are `date` in the facility's timezone (organization timezone for org-wide stats). Schedules are wall-clock windows evaluated in the timezone of the place they apply to (facility), with one JSON window shape `[{days:[1..7], from:'HH:MM', to:'HH:MM'}]` and one function `in_windows(windows, tz, ts)` used by operating hours, work schedules, segment schedules, access policy schedules and quiet hours.
- **GraphQL names**: tables live in schema `itap` (separate from Nhost `auth`/`storage`); every table gets `custom_name` (and root field names) without the `itap_` prefix in metadata, generated, not hand-written.
- Files: `*_file_id uuid → storage.files`, bucket check trigger (§4.1). No inline base64.
- Geo: facility `latitude/longitude numeric` (no PostGIS). Shapes in floor-plan pixel space as GeoJSON-like jsonb (`Polygon` or `{type:'Circle', center, radius}`).
- `custom_fields jsonb` validated against `custom_attribute_definitions` by trigger.
- **Deletion policy** (one rule per kind of reference):
  - *People and anything history points at* (members, profiles, identities, devices, facilities, areas): lifecycle by status (`deactivated/archived/terminated/merged`), not by delete. Hard delete only when nothing references the row (`NO ACTION`), or through the retention/erasure flows that anonymize or detach first.
  - *Configuration and reference data* (rules, templates, groups, policies, segments, companies, schedules): `NO ACTION` from referencing configuration; archived via status when in use.
  - *Owned children* (junction rows, steps, notes, versions, photos, embeddings): `CASCADE` from the owner.
  - *Logs and history* (detections, locations, events, decisions, attempts, deliveries, search results) referencing identities, profiles, devices, files or detections: `ON DELETE SET NULL (col)`, so retention and erasure can remove sources without losing the log row.
  - *Organization*: `CASCADE` to everything; constraints between business rows are `NO ACTION` (not `RESTRICT`) so the cascade completes in one statement.
- **Array exceptions** (never edited by forms): system caches (`areas.path`, `tracking_sessions.areas_visited`). Everything else, including polymorphic targets, uses typed nullable FKs with an exactly-one CHECK plus a partial unique index per branch.
- **JSON exceptions that contain ids**, each guarded: segment and notification-rule `conditions` (a rule language; a validation trigger checks every referenced id belongs to the org and that referenced segments are manual), and `identity_merge_moves (entity, row_id)` (an undo log, written and read only by merge functions).
- **Versioned entities** (access policies, event rules) use one pattern: a header row (identity, `current_version_id` = what is enforced) + version rows (`draft/pending_approval/published/superseded`) that own their children (subjects, targets, scopes). Editing = editing the draft version; publishing = flipping `current_version_id`; rollback = publishing an earlier version. Decisions and events reference the version that produced them.
- **Ids inside JSON**: never for references. JSON is used for shapes, layouts, rule parameters, payload snapshots.
- burojs `@burojs/hasura` alignment: one table per resource, flat columns, `_by_pk`, `_aggregate { count }` (hence `allow_aggregations`), many-to-one via FK columns, many-to-many via junction tables (burojs gains support, Linear REF-36), aggregates beyond count via `_aggregate` in custom queries or tracked functions.

**ro** = system-managed; **secret** = writable, never selectable.

### 6.1 Tenancy & users
| Table | Key columns | Notes |
|---|---|---|
| `organizations` | name, slug (unique), legal_name, logo_file_id, timezone, locale, status (`active/suspended`) | org_admin may update own org |
| `organization_members` | user_id, role → `member_roles`, status, title, department, joined_at, expires_at, invited_by | |
| `organization_invitations` | email, role, token_hash **secret**, status (`pending/accepted/revoked/expired`), expires_at, invited_by | Actions `invite_member`, `accept_invitation` |
| `organization_counters` | entity, last_value | internal |
| `user_settings` | user_id pk, locale, timezone, last_organization_id | role `user`, own row |
| `organization_settings` | organization_id pk (1:1), recognition_threshold, tracking_timeout_seconds, archive_unknown_after_days, tailgating_window_seconds, default_retention_days, … (typed columns with defaults) | One row per org, created with the org |

### 6.2 Companies, schedules, visits (office center)
| Table | Key columns | Notes |
|---|---|---|
| `companies` | name, kind (`tenant/contractor_vendor/service_provider/visitor_org`), contact_email, contact_phone, suite, status, cost_center | Tenants of the business center; ERP contractors/vendors, cost centers (SA_4) |
| `work_schedules` | name, timezone, windows jsonb (weekday + time ranges), description | "Night Shift" segments (FS §4.1), expected presence for auth population narrowing (SA_6) |
| `visits` | number, visitor_profile_id, host_profile_id, company_id, purpose, expected_start, expected_end, checked_in_at, checked_out_at, status (`scheduled/checked_in/checked_out/cancelled/no_show`), badge_number | Visitor management (Vision §3.1, FS §3.1, FS §6.1 visitor history); a visitor profile has many visits |

### 6.3 Identity (FS §2, SA_3 §2.1.1)
| Table | Key columns | Notes |
|---|---|---|
| `identities` | number, status → (`unverified/pending_verification/verified/suspended/archived/merged`), profile_id, link_strength, linked_at, linked_by, is_primary_for_profile, confidence **ro**, attributes jsonb (age, gender…), custom_fields, first_seen_at **ro**, last_seen_at **ro**, detection_count **ro**, primary_photo_file_id, source (`camera/enrollment/manual/import/merge/split`), matching_enabled **ro**, is_synthetic | `merged` identities are kept (history intact), excluded from matching; "merged into" is a relationship through `identity_merge_sources` (no copy on the row). `matching_enabled` false when biometric consent withdrawn (§8.2). `is_synthetic` for sandbox (SA_6). |
| `identity_embeddings` | identity_id, embedding vector(512) **ro**, quality_score, model_version, source_detection_id, photo_file_id, is_template **ro** | Top-5 templates by quality |
| `identity_photos` | identity_id, file_id, kind (`capture/enrollment/manual`), quality_score, captured_at, device_id | |
| `identity_relationships` | identity_a_id, identity_b_id, relation (`companion/related/other`), confidence, note | `CHECK (identity_a_id < identity_b_id)`, unique pair |
| `identity_duplicate_candidates` | identity_a_id, identity_b_id, similarity, status (`open/merged/dismissed`), detected_at | ordered pair CHECK + unique; status editable |
| `identity_merges` | target_identity_id, status (`completed/rolled_back`), reason, merged_by, rolled_back_by, rolled_back_at | |
| `identity_merge_sources` | merge_id, source_identity_id | Sources kept with status `merged` |
| `identity_merge_moves` | merge_id, entity, row_id, from_identity_id | Exact rollback (which embeddings/photos/detections moved) |
| `verification_requests` | identity_id, requested_by, assigned_to, status (`pending/approved/rejected/cancelled`), decided_by, decided_at, reason, evidence jsonb | Single-stage approval queue |

`IdentityUpdateLog` (FS §2.2) = `audit_log` filtered by entity.

### 6.4 Profile (FS §3, SA_3 §2.1.2)
| Table | Key columns | Notes |
|---|---|---|
| `profiles` | number, profile_type → (`employee/visitor/contractor/vip`), status → (`active/inactive/suspended/terminated`), first_name, last_name, email, phone, employee_id, company_id, department, job_title, access_level → (`basic/standard/elevated/admin`), start_date, end_date, work_schedule_id, avatar_file_id, notes, custom_fields, source_integration_id, external_id, identities_count **ro** | Computed fields: `has_face` (identities_count > 0, the FS "pending link" state), `is_blacklisted` (active entry in a `blacklist` watch list). Blacklisted (SA_3 type list) is shown from `is_blacklisted`; a blacklisted contractor stays a contractor. |
| `profile_documents` | profile_id, file_id, kind (`id_card/contract/nda/badge_photo/other`), title, version, valid_until | Opened via `open_file` (logged) |
| `consent_records` | profile_id, purpose → (`biometric_processing/tracking/analytics/marketing`), status (`granted/withdrawn`), granted_at, withdrawn_at, method (`paper/electronic/verbal`), document_file_id | Withdrawal has effects (§8.2) |
| `custom_attribute_definitions` | entity (`profile/identity/facility/device`), key, label, data_type, options, required, validation, visible_when, sort_order, is_active | |
| `profile_duplicate_candidates` | profile_a_id, profile_b_id, similarity, reasons jsonb, status (`open/merged/dismissed`) | Review queue (SA_3); found by cron on name/email/employee_id |

### 6.5 Segments (FS §4, SA_3 §2.1.3)
| Table | Key columns | Notes |
|---|---|---|
| `segments` | number, name, description, color, icon, kind (`manual/dynamic`), target (`identities/profiles`), conditions jsonb, status (`active/inactive/archived`), active_from, active_until, schedule jsonb, member_count **ro**, last_evaluated_at **ro**, template_id | |
| `segment_members` | segment_id, target, identity_id, profile_id, source (`manual/rule`), added_by, added_at, removed_at, removed_by | Exactly one of identity/profile, consistent with `target` (CHECK); FK `(organization_id, segment_id, target) → segments(organization_id, id, target)` makes kind = segment target declarative. Partial unique on active rows (`removed_at is null`). Rows are closed, never deleted → churn history. |
| `segment_templates` | name, description, target, conditions, category, is_system | |
| `segment_daily_stats` | segment_id, day, member_count, added, removed | **ro**, trend & churn (SA_3) |

Conditions: groups `{op:'and'|'or'|'not', children}`; leaves `{field, operator, value}`. Field catalog per target:
- **profiles**: profile columns, custom fields, company, work schedule (`on_shift_now`), visit status, membership in **manual** segments, behavioral (`visits_last_30d`, `avg_dwell_minutes`, `last_seen_days_ago`, `visited_area_id`, `after_hours_visits_30d`) from `profile_activity_stats`.
- **identities**: status, attributes (age, gender), first_seen, detection_count, linked/unlinked, membership in **manual** segments, the same behavioral metrics from `identity_activity_stats` (works for unknown identities).
- Referencing only manual segments rules out evaluation cycles.

### 6.6 Facilities, areas, floor plans (FS §7, SA_3 §2.1.5)
| Table | Key columns | Notes |
|---|---|---|
| `facility_templates` | name, description, structure jsonb (area tree, types, capacities) | Action `apply_facility_template` creates areas (SA_3 rapid deployment) |
| `facilities` | number, name (unique per org), description, address, latitude, longitude, timezone, status, operating_hours (windows), contact jsonb, custom_fields | Area count and occupancy are computed fields/aggregates over `areas` / `area_occupancy` (small tables), not stored counters |
| `areas` | facility_id, parent_id, path **ro**, depth **ro**, name, description, area_type → (`building/floor/zone/room/sector/entrance/corridor/parking/virtual_zone`), access_level → (`public/restricted/secure/classified`), capacity, shape jsonb (polygon or circle), loitering_threshold_seconds, status | Geofences (SA_3) are areas with a shape, incl. `virtual_zone` (radius/polygon not tied to walls); detection inside them is evaluated like any area (§8.2). `current_occupancy` = computed field (subtree count via `path`) |
| `floor_plans` | facility_id, area_id (unique; the floor), name, image_file_id, width_px, height_px, scale_m_per_px, level | An area/device finds its plan through its floor ancestor |
| `access_points` | facility_id, area_id, from_area_id, name, kind (`door/turnstile/gate/elevator/reception`), direction (`in/out/both`), position jsonb, is_entry_exit, status | `is_entry_exit` defines facility exits |
| `access_point_devices` | access_point_id, device_id, role (`camera/terminal/sensor`) | Cameras and terminals bound to a door |

### 6.7 Devices (FS §8, SA_2 §2.1.5)
| Table | Key columns | Notes |
|---|---|---|
| `devices` | number, name, device_type → (`static_video_camera/ptz_camera/thermal_camera/access_terminal/sensor`), facility_id, area_id (primary), position jsonb, coverage jsonb, stream_url, resolution, fps, status (`active/inactive/error/maintenance/connection_error`), health_status **ro**, last_seen_at **ro**, manufacturer, model, firmware_version, ip_address, configuration jsonb, custom_fields, recognition_enabled, recognition_fps (1..5), username, password **secret**, policy_version_synced **ro**, policy_synced_at **ro** | Credentials as secret columns (§5). Policy sync columns for terminals (SA_5 revocation convergence) |
| `device_areas` | device_id, area_id | Additional covered areas (Vision glossary: one or multiple Areas) |
| `device_health_metrics` | device_id, recorded_at, cpu_usage, memory_usage, disk_usage, network_latency_ms, frame_rate, error_count | **ro** |
| `device_events` | device_id, kind (`online/offline/error/config_changed/reboot/firmware_update`), message, payload, occurred_at | **ro** |

### 6.8 Detections & tracking (FS §9, SA_5 §2.1.1)
| Table | Key columns | Notes |
|---|---|---|
| `detections` | device_id, facility_id, area_id, access_point_id, identity_id, confidence, similarity, is_new_identity, bbox, frame_width, frame_height, quality_score, thumbnail_file_id, detected_at | **ro**; `access_point_id` from `access_point_devices` (camera role) |
| `tracking_sessions` | identity_id, profile_id, facility_id, visit_id, started_at, ended_at, duration_seconds, status (`active/completed/lost/error`), areas_visited **ro**, last_area_id, last_access_point_id, last_detected_at | Partial unique `(identity_id, facility_id) where status='active'`. Path = `identity_locations` by session (no JSON copy) |
| `identity_locations` | identity_id, session_id, area_id, device_id, detection_id, position jsonb, confidence, movement_type (`entry/exit/movement/stationary`), is_estimated, uncertainty_m, occurred_at | **ro**; `unique(detection_id)` |
| `area_occupancy` | facility_id, area_id, identity_id, session_id, entered_at, last_seen_at | **ro**; `unique(facility_id, identity_id)` = one leaf area per person per facility |

### 6.9 Events, incidents, operations (SA_5 §2.1.2, §2.1.5)
| Table | Key columns | Notes |
|---|---|---|
| `events` | event_type → see below, severity → (`info/low/medium/high/critical`), facility_id, area_id, access_point_id, device_id, identity_id, profile_id, detection_id, access_decision_id, authentication_attempt_id, rule_version_id, session_id, title, payload, dedup_key, occurred_at | **ro**; `unique(dedup_key)`. Events are **state changes**, not frames: dedup keys are `(session, type, area)` or `(identity, type, time bucket)`, so one person in front of a camera produces one arrival/entry/match, not one per frame |
| `event_rules` | number, name, description, rule_type → (`after_hours/loitering/unusual_dwell/occupancy/restricted_area/inactive_profile/watchlist/tailgating/unexpected_facility/abnormal_movement`), is_enabled, current_version_id **ro**, last_triggered_at **ro**, trigger_count **ro** | Versioned header (§6.0) |
| `event_rule_versions` | rule_id, version, status (`draft/pending_approval/published/superseded`), parameters jsonb (thresholds, windows), severity, creates_incident, escalation_policy_id, published_by, published_at | Replay/test runs a draft version against history (SA_5) |
| `event_rule_version_scopes` | version_id, facility_id, area_id, segment_id | exactly-one; empty = all |
| `incidents` | number, title, description, severity, status (`open/acknowledged/investigating/resolved/closed`), disposition (`true_positive/false_positive/benign/duplicate`), facility_id, area_id, assigned_to, escalation_policy_id, escalation_step **ro**, last_escalated_at **ro**, acknowledged_by/at, resolved_by/at, resolution, external_ref | Investigation = `investigating`. Unacknowledged = `acknowledged_at is null`. Policy copied from the triggering rule. |
| `incident_events` | incident_id, event_id | Only link between events and incidents |
| `incident_identities` | incident_id, identity_id, role (`subject/witness/related`) | |
| `incident_notes` | incident_id, author_id, body | |
| `incident_note_files` | note_id, file_id | |
| `incident_activities` | incident_id, actor_id, kind (`status_change/assigned/escalated/notified/action_taken/note/report_generated`), details jsonb, occurred_at | **ro** timeline (written by triggers and actions) |
| `watch_lists` | name, description, kind (`watch/blacklist/vip`), severity, color | |
| `watch_list_entries` | watch_list_id, identity_id, profile_id, reason, added_by, expires_at | exactly-one CHECK; expiry implicit |
| `shift_handovers` | from_user_id, to_user_id, shift_started_at, shift_ended_at, summary, acknowledged_at | |
| `shift_handover_incidents` | handover_id, incident_id | |
| `operator_workspaces` | user_id, name, layout jsonb, is_default | |

Event types (`event_types`): `detection_unknown, detection_known, watchlist_match, blacklist_match, vip_arrival, inactive_profile_detected, restricted_area_entry, access_granted, access_denied, tailgating, loitering, unusual_dwell, after_hours, unexpected_facility, abnormal_movement, occupancy_exceeded, device_offline, device_online, device_error, auth_success, auth_failed, emergency_override_started, emergency_override_ended, saved_search_match, integration_failed, admin_action`. Every type has a producer in §8.

### 6.10 Analytics & reports (FS §10, SA_3 §2.1.6)
| Table | Key columns | Notes |
|---|---|---|
| `reports` | number, report_type → (`flow/occupancy/heatmap/behavior/attendance/segment/compliance/device_health/incident`), title, description, parameters, start_date, end_date, incident_id, format (`pdf/xlsx/csv/json`), status (`queued/generating/completed/failed/expired`), file_id, summary, error, template_id, schedule_id, generated_at | |
| `report_facilities` / `report_segments` | report_id + target | |
| `report_templates` | name, report_type, parameters, is_system | |
| `report_schedules` | template_id, name, cron, timezone, recipient_group_id, channel (`email/webhook/in_app`), is_active, last_run_at **ro**, next_run_at **ro** | Delivery via `notification_deliveries.report_id` |
| `report_metrics` | report_id, metric_name, metric_type (`count/average/percentage/rate`), value, unit, category, dimension jsonb | |
| `area_hourly_stats` | area_id, hour, unique_identities, entries, exits, avg_dwell_seconds, peak_occupancy | **ro** |
| `facility_daily_stats` | facility_id, day, unique_identities, known_identities, unknown_identities, visits, avg_visit_minutes, peak_occupancy, peak_hour | **ro** |
| `area_transitions_daily` | facility_id, day, from_area_id, to_area_id, count | **ro** |
| `identity_activity_stats` | identity_id, visits_last_30d, avg_dwell_minutes, last_seen_at, after_hours_visits_30d, top_area_id | **ro** |
| `profile_activity_stats` | profile_id, same metrics rolled up over linked identities | **ro** |
| `dashboards` | name, description, layout jsonb, widgets jsonb, is_shared, owner_id | |

### 6.11 Search & bulk (FS §6, SA_3 §2.1.4, §2.1.2)
| Table | Key columns | Notes |
|---|---|---|
| `search_requests` | user_id, search_type (`facial/attribute/combined`), image_file_id, filters, threshold, max_results, status, results_count **ro**, duration_ms **ro**, top_confidence **ro** | History |
| `search_results` | search_request_id, identity_id, rank, confidence, match_type (`exact/partial/fuzzy`) | **ro** (rows, not JSON) |
| `saved_searches` | name, search_type, filters, image_file_id, is_shared, schedule_cron, alert_on_match, last_run_at **ro** | |
| `bulk_jobs` | kind (`profile_import/profile_update/bulk_search`), input_file_id, status (`queued/running/completed/partial/failed`), total, processed, succeeded, failed, result_file_id, errors jsonb | Progress tracking, partial commit (SA_3) |

### 6.12 Notifications (FS §11, SA_5 §2.1.3)
| Table | Key columns | Notes |
|---|---|---|
| `notification_rules` | number, name, description, conditions jsonb, priority, recipient_group_id, template_id, escalation_policy_id, is_active, digest_mode (`none/hourly/daily`), last_triggered_at **ro** | |
| `notification_rule_event_types` | rule_id, event_type | |
| `notification_rule_channels` | rule_id, channel → `notification_channels` | |
| `notification_templates` | name, channel, locale, subject, body, is_system | |
| `recipient_groups` | name, description | |
| `recipient_group_members` | group_id, user_id, external_address, channel | exactly-one of user/address |
| `escalation_policies` | name, repeat | |
| `escalation_policy_steps` | policy_id, step_no, after_minutes, recipient_group_id, on_call_schedule_id, channel | exactly-one of group/schedule |
| `on_call_schedules` | name, timezone, shift_length_hours, rotation_start_at | Resolved to the current member by escalation (§8.3) |
| `on_call_schedule_members` | schedule_id, user_id (composite member FK), position | Ordered rotation |
| `notification_subscriptions` | user_id, event_type, facility_id, identity_id, profile_id, watch_list_id, channel, min_severity | Self-service, facility-scoped, identity-specific (SA_5) |
| `notification_deliveries` | rule_id, escalation_step_id, subscription_id, report_id, event_id, incident_id, recipient_user_id, recipient_address, channel, status (`pending/sent/delivered/failed/retrying/dead_letter`), attempts, content, sent_at, delivered_at, acknowledged_at, escalation_cycle, error | **ro**; exactly-one origin (rule / escalation step / subscription / report) and exactly-one recipient (CHECKs); one partial unique index per origin (`rule_id, event_id, recipient, channel` / `escalation_step_id, incident_id, escalation_cycle, recipient` / `subscription_id, event_id` / `report_id, recipient, channel`) — idempotent despite nullable columns |
| `user_notifications` | user_id, delivery_id, event_id, incident_id, title, body, priority, read_at, acknowledged_at | In-app inbox; owner may set read/ack |
| `webhook_subscriptions` | url, secret **secret**, is_active | |
| `webhook_subscription_event_types` | subscription_id, event_type | |
| `webhook_deliveries` | subscription_id, event_id, status, attempts, response_code, signature, sent_at, error | **ro** (HMAC-SHA256, retries — SA_2/SA_5) |

### 6.13 Physical access control (SA_5 §2.1.4)
| Table | Key columns | Notes |
|---|---|---|
| `access_policies` | number, name, description, is_archived, current_version_id **ro** | Versioned header (§6.0); enforced = has `current_version_id` and not archived (archiving clears it) |
| `access_policy_versions` | policy_id, version, status (`draft/pending_approval/published/superseded`), effect (`allow/deny`), priority, schedule (windows), valid_from, valid_until, submitted_by, approved_by, approved_at, published_by, published_at | Approval workflow on the version (SA_5) |
| `access_policy_version_subjects` | version_id, profile_id, segment_id, profile_type, access_level | exactly-one; copied on new draft |
| `access_policy_version_targets` | version_id, facility_id, area_id, access_point_id | exactly-one; copied on new draft |
| `access_grants` | profile_id, area_id, access_point_id, valid_from, valid_until, single_use, used_at, reason, granted_by | exactly-one target |
| `access_decisions` | access_point_id, device_id, identity_id, profile_id, decision, policy_version_id, grant_id, reason, risk_score, signals jsonb, latency_ms, decided_at | **ro** |
| `emergency_overrides` | facility_id, mode (`unlock_all/lock_all/evacuation`), justification, started_by, started_at, ends_at, ended_by, ended_at | |
| `emergency_override_areas` | override_id, area_id | |

### 6.14 Audit, compliance, governance (SA_4)
| Table | Key columns | Notes |
|---|---|---|
| `audit_log` | organization_id (no FK, survives org cascade), user_id, action (`insert/update/delete/switch_org/export/view_sensitive/merge/rollback/approve/reject/publish`), entity, entity_id, changes jsonb (diff, secrets redacted), reason, ip, user_agent, occurred_at | **ro**, append-only |
| `retention_policies` | data_class (`detections/locations/events/photos/audit/auth_attempts/unknown_identities/sessions`), facility_id (null = all), retain_days, action (`delete/anonymize/archive`), is_active | |
| `legal_holds` | name, reason, starts_at, ends_at, created_by | |
| `legal_hold_targets` | hold_id, identity_id, profile_id, incident_id, facility_id | exactly-one; a hold on an identity/profile/incident/facility covers rows referencing it |
| `data_subject_requests` | profile_id, request_type (`access/erasure/rectification/portability/restriction`), status (`received/in_progress/completed/rejected`), due_at, completed_at, export_file_id, notes | |
| `processing_activities` | name, purpose, legal_basis, data_categories jsonb, retention_policy_id, dpia_status (`not_required/required/in_progress/approved`), dpia_file_id, owner_id | Records of processing + PIA (SA_4) |

### 6.15 Integrations & exports (SA_4)
| Table | Key columns | Notes |
|---|---|---|
| `integrations` | name, kind (`hr/erp/siem/bms/webhook/custom`), provider, config, field_mapping, direction, status (`active/paused/error`), secret **secret**, last_sync_at **ro**, last_error **ro** | |
| `integration_sync_runs` | integration_id, started_at, finished_at, status (`running/succeeded/failed`), records_in, records_out, errors | **ro** |
| `export_definitions` | name, entity, format (`csv/json/xlsx`), filters, mode (`full/incremental`), schedule_cron, watermark **ro**, is_active | |
| `export_jobs` | definition_id, status, file_id, row_count, requested_by, started_at, finished_at | |

### 6.16 Face authentication service (FS §5, SA_6)
| Table | Key columns | Notes |
|---|---|---|
| `client_applications` | number, name, description, platform (`web/android/ios/server/kiosk`), status (`active/suspended/revoked`), threshold, threshold_min, threshold_max, liveness_required, use_work_schedules bool, is_sandbox | Sandbox apps may only bind synthetic identities (trigger) |
| `client_application_segments` / `client_application_facilities` / `client_application_access_points` | application_id + target | Bound population and locations |
| `client_application_modes` / `client_application_attributes` | application_id + enum value | Allowed modes and attributes (enum sets as junctions) |
| `client_application_keys` | application_id, key_prefix, secret_hash **secret**, created_by, expires_at, revoked_at, last_used_at **ro** | |
| `authentication_attempts` | application_id, session_id, step (`initial/recapture/second_factor`), mode, claimed_identity_id, matched_identity_id, profile_id, access_point_id, device_ref, outcome (`success/partial_match/failure`), review_status (`none/pending/approved/rejected`), confidence, threshold_used, population_size, population_scope jsonb (snapshot of segments/facilities/schedule applied), retrieval_candidates, retrieval_hit bool, comparison_score, failure_reason (`no_face/multiple_faces/low_quality/blur/poor_lighting/not_in_population/not_retrieved/below_threshold/liveness_failed`), attack_outcome (`passed/printed_photo/screen_replay/mask/injection/not_checked`), model_version, image_file_id, latency_ms, ip, user_agent, attempted_at | **ro**; separates retrieval vs comparison (SA_6) |

### 6.17 Not separate tables
Embedding/Attribute/Heatmap/Enrollment/Session (columns or computed), occupancy (`area_occupancy` + columns), processing/SLA/cost metrics (Action `get_system_status`: live service checks + DB stats), data dictionary (generated from metadata/table comments), dead letters (delivery status), digests (rule mode), user sessions (Nhost `auth.refresh_tokens`), entity versions (audit diffs; access policies have explicit versions), support/training/QA (non-goal).

## 7. Face recognition on the new schema

Pipeline (stream-server snapshot → backend → InsightFace) stays. Changes:
- Organization resolved via device. Matching through tracked function `match_face(embedding, threshold, limit)` scoped by the session's organization, over templates of identities with `matching_enabled` and status not `merged/archived`. **Exact scan** (no HNSW: a few thousand templates per org scan in milliseconds, and filtered HNSW can miss matches). Pin the pgvector image version.
- No overwrite of stored embeddings (fixes drift): a new embedding is added only if it beats the worst of the top-5 templates; template upkeep is a SQL function (atomic).
- Crops → org bucket (`metadata.kind = 'identity_photo'`), referenced by `identity_photos` and `detections.thumbnail_file_id`.
- Backend inserts the detection through Hasura. Tracking state is updated in the same transaction; event evaluation and notifications run right after commit, isolated from the insert (§8.2), so a rule bug can never block recognition.
- Recognition control via Actions `recognition_start/stop/status(device_id)`. Socket.io stays for pushing live detections (Hasura subscriptions are the alternative; decided in the UI phase).
- Enrollment: `enroll_face(profile_id, file_ids[])` and `create_identity_from_photos(file_ids[], attributes)` / `add_identity_photos(identity_id, file_ids[])`: files uploaded first, processed sequentially (fixes the parallel lock bug), duplicate check against the org ("Duplicate Identity detected", FS §2.1), conflict returned for resolution (FS §2.2), never creates duplicates. Async action (timeout configured) since CPU InsightFace may exceed 30 s.

## 8. Server-side logic

### 8.0 Placement and safety rules
- **SQL trigger / SQL function**: anything that must be transactional or idempotent — counters, paths, audit, validation, the per-detection tracking state, event evaluation, event → notification matching, merges/splits. All time logic uses the row's own timestamp (`detected_at`, `occurred_at`), never `now()`, so replaying history (seed) runs the same logic.
- **One evaluator per rule language**: segment conditions are translated to Hasura `where` in the backend only (preview = Action `preview_segment` using the same translator, so Hasura permissions apply); there is no second SQL evaluator.
- **Tracked SQL functions**: every function takes `hasura_session` (session argument) and filters by `x-hasura-organization-id` inside; results returned as rows of tables in `itap_results` that carry `organization_id` with the standard permission filter (double guard). `HASURA_GRAPHQL_INFER_FUNCTION_PERMISSIONS=false`; permissions granted explicitly. Volatile functions are mutations.
- **Actions → backend** only where something outside Postgres is needed (InsightFace, JWT signing, file rendering, storage, external delivery). Handlers call Hasura with the admin secret **and the caller's `x-hasura-role`, `x-hasura-organization-id`, `x-hasura-user-id`** (from the action payload), so Hasura permissions and composite FKs apply and audit records the actor. File arguments are checked against the org bucket.
- **Event triggers → backend** only for external side effects (sending, rendering, syncing). They are at-least-once and concurrent: handlers are idempotent (state checks, unique keys, `ON CONFLICT`), retry config set explicitly.
- **Cron triggers → backend**, which then calls SQL functions per organization.

### 8.1 SQL triggers and functions
Triggers:
- `set_updated_at`, `assign_number`, `check_file_bucket`, `areas_maintain_path` (cycles rejected), `create_org_bucket`.
- `audit_row_change` on business tables → `audit_log`: secret columns redacted; skips updates touching only **ro** columns; skips high-volume tables (detections, locations, area_occupancy, events, decisions, attempts, deliveries, webhook deliveries, health metrics, device events, sync runs, stats); skips rows whose organization is being deleted.
- Stored counters only where lists sort/filter on them at scale: `profiles.identities_count`, `segments.member_count`, identity `detection_count`/`last_seen_at` (throttled: written at most once per N seconds per identity, to keep the identity row cool). Occupancy and area counts are computed (small tables).
- `validate_custom_fields`, `validate_condition_refs`, `sandbox_population_check`, `active_member_check`.
- `consent_withdrawn`: biometric consent withdrawn → linked identities `matching_enabled = false` (embeddings deleted after the retention window by `retention_cleanup`).
- `incident_activity_log`: status/assignment changes → `incident_activities`.
- `version_published` (access policies and event rules): version → `published` sets the header's `current_version_id`, previous published version → `superseded`; editing a published policy/rule creates a new draft version with copied children.

Query functions: `match_face`, `area_descendants`, `facility_occupancy_now`, `identity_timeline`, `occupancy_series(facility, from, to, bucket)`, `flow_matrix(facility, from, to)`, `dashboard_kpis()`, `delivery_report(from, to)` (volumes, ack rates, response times per channel), `policy_analytics(from, to)`.

Mutation functions (called directly by the UI or by action handlers, always org-scoped): `merge_identities`, `rollback_merge`, `split_identity`, `merge_profiles`, `approve_verification`, `reject_verification`, `acknowledge_incident`, `escalate_incident` (manual), `resolve_incident`, `sync_segment_members(segment_id, ids)`, `check_in_visit`, `check_out_visit`, `start_emergency_override`, `end_emergency_override`, `check_access(access_point_id, identity_id|profile_id)` (evaluates published versions + grants, writes decision + event), `test_event_rule(rule_id, from, to)` and `simulate_access_policy(policy_id, from, to)` (replay history, return diffs without writing events), `test_notification_rule(rule_id)`.

### 8.2 Detection pipeline
**Stage A — tracking state (SQL, AFTER INSERT on `detections`, same transaction, small and bounded):**
1. Identity `last_seen_at`/`detection_count` (throttled).
2. Session: if the identity's active session in this facility has `last_detected_at` older than the tracking timeout → close it (`completed` if the last location was an `is_entry_exit` access point, else `lost`) and open a new one; otherwise extend. Link a checked-in or scheduled visit of that day.
3. On area change: write `identity_locations` (`unique(detection_id)`) and move `area_occupancy` (`unique(facility_id, identity_id)`); record the transition on the session (`state_changed` marker used by stage B).

**Stage B — event evaluation (Hasura event trigger on `detections` → backend → SQL function `evaluate_detection(detection_id)`, after commit, idempotent):**
Events are emitted on **state changes only**, with dedup keys on the state:
- session opened → `detection_known` / `detection_unknown`, `watchlist_match` / `blacklist_match` / `vip_arrival` (watch list kinds), `inactive_profile_detected` (suspended/terminated profile), `unexpected_facility` (first visit of a known profile), `after_hours` (outside facility operating hours, via `in_windows`) — key `(session, type)`;
- area entered → `restricted_area_entry` (area access rank above profile clearance rank, or no published policy version / grant allows the area — visitors outside authorized areas, FS §9.1), `abnormal_movement` (transition not seen in `area_transitions_daily` for 30 days), `occupancy_exceeded` (area count passes capacity) — key `(session, type, area)`;
- access point passed → `tailgating` (≥2 identities at the same access point within the org's window against ≤1 `access_granted` decision) — key `(access_point, type, time bucket)`.
Published event-rule versions in scope then set severity, `rule_version_id`, and create incidents (`creates_incident`) with the version's escalation policy.

Time-based rules (`loitering`, `unusual_dwell`) are evaluated by cron (§8.3) from `area_occupancy` durations, key `(occupancy row, type)`.

**Stage C — notification fan-out (SQL, AFTER INSERT on `events`)**: match active notification rules (event-type and channel junctions, conditions, priority rank) and subscriptions (min severity rank) of active members → `notification_deliveries` + `user_notifications` (in-app delivered immediately); webhook subscriptions → `webhook_deliveries` (pending). Per-origin partial unique indexes make it idempotent. This runs inside stage B's transaction, not the detection insert.

### 8.3 Cron triggers
| Cron | Schedule | Does |
|---|---|---|
| `close_stale_sessions` | 2 min | only for people who never came back: active sessions with `last_detected_at` older than the timeout → closed with the same rule as stage A; occupancy cleared |
| `evaluate_dwell_rules` | 1 min | loitering / unusual dwell events from occupancy durations |
| `device_health_check` | 1 min | probe stream-server per camera → metrics, `health_status`, `last_seen_at`, `device_events`, `device_offline/online/error` events on transitions (real data) |
| `escalate` | 1 min | incidents with `acknowledged_at is null` past the current step's `after_minutes` since `last_escalated_at` → next step deliveries (on-call schedule resolved to current member), `incident_activities` |
| `end_emergency_overrides` | 1 min | past `ends_at` → end + `emergency_override_ended` event |
| `aggregate_stats` | hourly | hourly/daily/transition stats, identity & profile activity stats, segment daily stats, identity confidence refinement (match frequency, verification, template quality) |
| `evaluate_segments` | hourly | dynamic segments (time windows, schedules) via the backend translator + `sync_segment_members` |
| `run_report_schedules` | 15 min | due schedules → `reports` |
| `run_saved_searches` | hourly | scheduled searches → `saved_search_match` events |
| `run_export_definitions` | 15 min | due exports → `export_jobs` (incremental uses watermark) |
| `lifecycle_jobs` | daily | visitor/contractor end_date → `inactive`; no-show visits; archive unknown identities unseen for N days; expire invitations |
| `retention_cleanup` | daily | per policy (facility-specific first), skipping legal-hold coverage; files via storage API |
| `find_duplicates` | daily | identity template similarity → identity candidates; name/email/employee_id → profile candidates |
| `send_digests` | hourly | digest-mode rules |

### 8.4 Event triggers (external side effects only)
| Trigger | On | Does |
|---|---|---|
| `send_delivery` | insert `notification_deliveries` (non in-app) | email → log/Mailhog if configured; sms/push/webhook → stub `sent/delivered`; failures → retries → `dead_letter` |
| `send_webhook` | insert `webhook_deliveries` | real HTTP POST with HMAC-SHA256 signature, retries |
| `render_report` | insert `reports` | compute from stats/functions, render (CSV/JSON real; PDF/XLSX simple), upload, deliver to schedule recipients |
| `run_export` | insert `export_jobs` | export via Hasura with job owner's role, upload |
| `run_bulk_job` | insert `bulk_jobs` | process file row by row, progress, partial commit |
| `run_sync` | insert `integration_sync_runs` | stub: HR applies a fixture file (creates/updates/deactivates profiles with `source_integration_id/external_id`), others plausible counts; failure → `integration_failed` event |
| `fulfil_dsr` | insert `data_subject_requests` | access/portability bundle; erasure anonymizes |
| `segment_inputs_changed` | update of user-editable profile/identity columns, insert/close of manual `segment_members` | re-evaluate dynamic segments referencing them (debounced per org; ignores `source='rule'`) |

### 8.5 Actions (backend)
`switch_organization`, `invite_member`, `accept_invitation`, `enroll_face`, `create_identity_from_photos`, `add_identity_photos`, `search_faces` (writes `search_requests` + `search_results`), `evaluate_segment`, `preview_segment`, `upload_profile_document`, `delete_file`, `recognition_start/stop/status`, `apply_facility_template`, `rotate_client_key` (plaintext once), `authenticate_face` (SA_6; also backend REST for client apps with key auth; writes attempts + `auth_success/auth_failed` events), `open_file`, `run_integration_sync`, `generate_incident_report`, `get_system_status`, `publish_policy_to_terminals` (marks terminals synced; demo of revocation convergence).

Stubbed outside world: email/SMS/push, integrations, liveness (returns `not_checked` unless a cheap heuristic exists), PDF/XLSX fidelity, terminal sync.

## 9. Seed
- `pnpm seed` (TypeScript in the backend workspace) via Hasura (admin secret) and the storage API. `--reset` truncates `itap.*` and deletes seed files through the storage API. Timestamps relative to now.
- Users: 3 Nhost users (password from env): `admin@itap.demo` in both orgs, one admin per org.
- Orgs: **"Nova Tower Business Center"** (main) and **"Riverside Office Park"** (small; switching and isolation demo).
- Main org: 24-floor tower + parking; building → floors → zones/rooms; lobby with turnstiles and reception, secure server room, restricted executive floor; floor plans (generated images) for lobby + 2 floors; 8–12 tenant companies; work schedules incl. night shift.
- Faces (owner-approved approach): faces cut from the four stream-server videos become known profiles (employees, a VIP, one blacklisted person) so live alerts fire on camera; all other profiles use generated faces of non-existent people. Embeddings computed by InsightFace during seeding.
- People: ~150 profiles (tenant employees, contractors, visitors with visits and hosts, VIPs, blacklist entries), ~250 identities (~80 unknown), synthetic identities for the sandbox app.
- History is produced by **replaying detections in time order through the real pipeline** (stage A trigger + `evaluate_detection`), so sessions, locations, occupancy, events, incidents and deliveries come from the same logic the demo runs live; only things with no live producer are inserted directly (estimated locations, past reports/files, auth attempts, sync runs, bulk jobs, DSRs). Seeded webhook subscriptions point at a local sink; external delivery is stubbed.
- 30 days of history: detections, sessions, locations (some estimated), events of every type, incidents with notes/activities, deliveries, webhook deliveries, access decisions, auth attempts (all outcomes), reports with files, stats, segment stats, audit, sync runs, bulk jobs, DSRs.
- Configuration: segments (both targets, templates), event rules, notification rules/templates/groups/escalations/on-call, subscriptions, access policies (published, draft, pending approval) with versions, grants, watch lists, client apps (incl. sandbox), integrations (HR, SIEM, BMS), retention policies, legal hold, processing activities, custom attributes, facility template.

## 10. Delivery
- **Vertical slices**, each migrated, permissioned, seeded and checkable before the next: (1) tenancy, auth/token, storage, audit; (2) companies, profiles, identities, recognition, enrollment; (3) facilities, areas, floor plans, access points, devices, health; (4) detections processing, tracking, events, incidents, watch lists, visits; (5) notifications, escalation, webhooks; (6) segments; (7) analytics, reports, search, bulk; (8) physical access; (9) face auth service; (10) compliance, integrations, exports.
- Fresh migration set (one logical change per migration); metadata regenerated; `public.test` removed; `make hasura_apply` fixed; `INFER_FUNCTION_PERMISSIONS=false`; pgvector image pinned.
- Backend: TypeORM removed, all data via Hasura; dead deps removed (face-api.js, tfjs, redis, bcrypt); `jsonwebtoken` kept for org tokens; env fixed; committed `.env` replaced by `.env.example`.
- Prod stack updated the same way (DB and storage recreated, seed run on the server, cron/event webhook URLs, InsightFace reachable from seed).
- Update `.claude/rules/demo-project.md` (stubs in §8.5 allowed when the data flow is real) and `hasura-conventions.md` (enum value case, composite FKs, function rules).
- Current admin-ui left as-is until the burojs rebuild.

## 11. Left to the builder
Column types/lengths, extra indexes, migration granularity, backend module layout, seed content details, JSON shapes not fixed above (layouts, widgets, rotation, parameters), relationship naming per repo convention, retry counts.

## 12. Designer's calls (not discussed with the owner)
- One `segment_members` table (closed, not deleted) instead of two membership tables.
- Investigation = incident status; events ↔ incidents only via junction.
- `companies`, `visits`, `work_schedules` for the office-center scenario.
- Blacklist and VIP as watch list kinds; profile type list without `blacklisted` (shown via computed `is_blacklisted`); profile `pending` replaced by computed `has_face`.
- Geofences modeled as areas with shapes (incl. `virtual_zone`), no separate table.
- Composite FKs for tenant/user/facility isolation instead of a consistency trigger.
- Detection pipeline split: tracking state in the insert transaction, event evaluation and notifications in SQL right after commit (event trigger → `evaluate_detection`); events only on state changes.
- One versioning pattern (header + versions owning children) for access policies and event rules.
- Two-token flow kept (owner decision) over Nhost custom claims; cost: the client manages the org token and its renewal itself (Nhost SDK only refreshes the base token).
- Merges keep source identities (`merged`) for exact rollback.
- Exact vector scan instead of HNSW.
- Org token TTL 15 min; no platform super-admin; logos in a shared bucket.
- No PostGIS; floor-plan pixel coordinates.
- Seed organization names and volumes.
