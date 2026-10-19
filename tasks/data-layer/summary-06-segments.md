# Slice 6 summary: Segments (membership history, one evaluator, activity stats)

Branch `feat/data-layer-foundation`: commits `8e609f0..HEAD` (`ede1ebf` .. `8bfe466` plus the Task 5 docs/gates commit). Spec: `design.md` (§6.5, §6.10, §8.0, §8.3, §8.4); plan: `plan-06-segments.md`.

## What was built

- **Schema**: `segments` (code `SEGMENT`, kind `manual/dynamic`, target `identities/profiles`, `conditions` jsonb, status `active/inactive/archived`, `active_from/active_until`, `schedule`, ro `member_count`, `last_evaluated_at`, `last_evaluation_error` + `last_evaluation_failed_at` (both null or both set), `template_id`), `segment_members` (one table; `target` column and composite FK `(organization_id, segment_id, target)`; source `manual/rule`; rows are closed, never deleted; partial unique indexes on open rows), `segment_templates` (system templates read-only; the segment's template FK carries the target), `segment_daily_stats`, `identity_activity_stats` / `profile_activity_stats`. `kind` and `target` are immutable after creation (metadata insert-only plus SQL guard); a manual segment has `conditions = '{}'`, a dynamic one must have conditions (`segment_conditions_required`). History FKs (`segment_members`, `segment_daily_stats` -> segments) are NO ACTION: a segment with history is archived, not deleted. A segment named by another segment's or template's condition, an event rule scope or a notification rule cannot be deleted (`segment_referenced`). `identities.age` is a stored generated column (from `attributes.age`) so range operators work in a Hasura `where`.
- **Field catalog** `itap.segment_field_catalog` / query `segment_fields(p_target)` is the single source: field, value type, operators, enum values, label; organization custom fields appear as `custom_fields.<key>`. Validation (`itap.validate_segment_conditions`, errors `segment_condition_invalid:<json path>`), the backend translator and the tests all use it. Caps: depth 7, at most 100 children per group, at most 500 values in `in/nin`, `|relative_days| <= 36500`, integers within int4, numbers below 1e15. Dates and timestamps accept an absolute value or `{"relative_days": n}` (resolved at evaluation time: org-local evaluation day + n, or `at + n days`). References (company, work schedule, area, segment) must belong to the organization; `member_of_segment` only names manual segments of the same target (no cycles). jsonb path fields take eq/neq/in/nin/is_null only.
- **Behavioral metrics** (`visits_last_30d`, `avg_dwell_minutes`, `last_seen_days_ago`, `after_hours_visits_30d`, `top_area_id`) come from the activity stats tables, refreshed by `itap.refresh_activity_stats(org, at)` (window 30 days before `at`; per-org advisory lock; rows only for subjects ever seen; stale rows deleted; identities map to their effective merge target, profiles roll up effective identities; top area counts entries only; every row carries `as_of`).
- **Translator + one evaluator** (`apps/backend/src/segments/`): conditions JSON -> Hasura `where` (`translate.ts`, `translateFields.ts`), executed with an org session so permissions apply. Used by `preview_segment` (query action, count + sample, validation first), `evaluate_segment` (mutation action), the crons and the seed history (`matchingSubjects`). Time-dependent inputs (org timezone and local day, on-shift schedules, segment active-at) come from the query `segment_evaluation_context`.
- **`itap.sync_segment_members(segment, ids, at)`** (backend only, roles `[]`): lock order subjects `FOR KEY SHARE` in id order, then the segment `FOR UPDATE`, then member rows. Manual segment refused; foreign or other-target ids ignored; merged identities skipped (their open rule rows close); a segment not active at `at` closes all rule rows; opens rule rows only for subjects without an open row of any source; closes unmatched rule rows at `greatest(at, added_at)`; never touches manual rows; `at < last_evaluated_at` is stale and changes nothing; a new rule row never starts before the subject's latest removal (`added_at = greatest(at, max(removed_at))`). Churn is exact: re-evaluation of unchanged input writes nothing; leaving and re-entering gives a closed row plus a new row.
- **Manual membership**: `add_segment_members` / `remove_segment_members` (org_admin mutations; org_admin has select only on the table). Adding a current rule member pins it (rule row closed, manual row opened at the same instant). Same lock order as sync; merged identities refused (`identity_merged`).
- **Merges**: `merge_identities` / `rollback_merge` fold open manual memberships of the sources onto the target (source row closed, target row opened unless already a member; when the target is an open rule member that rule row is closed and the manual row opened = pin; all recorded in the move log and exactly undone by rollback). Activity stats follow merges (see above).
- **Debounce**: deferred constraint triggers (fire at commit, once per transaction and organization) on profiles, identities (insert/delete; status/profile_id/attributes), `watch_list_entries`, `watch_lists.kind`, visits, work schedules, manual `segment_members` and segment definitions write `segment_evaluation_requests` (per org, `requested_at`, `first_requested_at`). Cron `evaluate_segments_pending` (every minute, tolerance 120) evaluates organizations whose first unprocessed request is at least 30 s old (batching window, so continuous writers cannot starve it), at `max(scheduled_time, now())`, then finishes the request only if it was not renewed. If any sync was stale or any segment failed transiently the org stays pending.
- **Hourly `evaluate_segments`** (tolerance 3600): `run_activity_stats` -> evaluate all dynamic segments (active ones, or inactive ones that still have open rule rows) -> `refresh_segment_daily_stats` (idempotent per scheduled time). Daily stats write one row per segment for the org-local day of `at` and of `at - 1 h` (a day is finished by the first run of the next day): `member_count` = rows open at `at` (or at day end), `added` / `removed` = rows opened / closed that day; a close and an open of the same subject in the same segment at the same instant (pin, clamp) count as neither.
- **Failure recording**: a failing segment (e.g. deactivated custom field) gets `last_evaluation_error` / `last_evaluation_failed_at` and the run continues; rule rows stay as they were; the next successful sync clears both. An organization-level step failing fails the run (500) after all organizations were tried.
- **Event rule segment scopes** (`event_rule_version_scopes.segment_id`, FK NO ACTION): `matching_rule_versions(..., p_identity, p_profile, p_at, p_check_segments)`. Membership is checked at the event's `occurred_at` (row `added_at <= t < removed_at`, manual or rule). Scope kinds combine with AND, scopes of one kind with OR. `evaluate_dwell_rules` checks segment scopes per version at `entered_at + dwell_seconds`.
- **Notification rules**: condition key `segment_id` (segment of the org, any target; validated with `FOR KEY SHARE`), matched through `itap.subject_in_segment` at the event time. `itap.test_notification_rule(rule, limit)` (org_admin query, limit clamped to 1..100) dry-runs against the last N events: `would_match`, `reason` (`event_type_mismatch | condition_mismatch | match`), `recipient_count`, distinct `{channel, user_id, address}`; ignores `is_active`, writes nothing.
- **Seed** (step `segments`, last, after the replay): 7 system templates per org; Nova segments (Night shift, Frequent visitors, VIP, Contractors ending soon, Unknown frequent faces, Executive floor access (manual, with a removal), Parking permit holders (inactive), Floor 12 fit-out crew (active window), Weekend presence (Sat+Sun schedule)); Riverside "Security staff". History: 34 evaluation times (configuration time + 1 min, 23:59:59 local of each day, now), 239 syncs, 297 daily stats rows, all written in **one transaction** so the live crons never see partial history; evaluation after the replay is exact because the stats only use data before `at`. Event rule "Fit-out crew after hours" (facility AND segment scope) and notification rule "Executive access holders" (`segment_id` condition) are dated at seed time, so they have no history.
- Also (T1): `user_notifications` org_admin update permission narrowed to `read_at` (acknowledgement only through `acknowledge_notification`).

## Rulings (from the ledger)

- Manual membership only through `add/remove_segment_members`; org_admin select-only on `segment_members`; the field catalog is a SQL function (single source for the backend translator).
- Identity merges: activity stats map to the effective identity; open manual memberships fold onto the target through the move log (configuration follows the person); a target rule member is pinned.
- Catalog trimmed to what a Hasura `where` can express (jsonb paths eq/neq/in/nin/is_null; `identities.age` generated column); caps (children, in-list, relative_days, int bounds); FKs `FOR KEY SHARE` on referenced segments.
- `visited_area_id` renamed `top_area_id` ("Most visited area (30 days)", nullable); "visited at all" would need a per-area stats junction table.
- Null semantics are two-valued: a comparison on null is false and `not` is a plain negation (`not(visits >= 2)` matches never-seen subjects).
- `schedule = []` means no restriction (same as NULL).
- A dynamic segment must have conditions (`{}` refused at save).
- Evaluation failure of one segment is recorded on the segment and the others continue.
- Debounce through SQL triggers plus `segment_evaluation_requests` and a 1-minute cron instead of per-table Hasura event triggers (fewer backend round trips); deferred commit-time triggers (no hot per-org lock held during long transactions); `first_requested_at` anti-starvation.
- Hourly `evaluate_segments` = activity stats + all dynamic segments + daily stats.
- Segment scope membership is read as of `occurred_at` (replay-deterministic, spec §8.0); the seed back-dates membership. Location and segment scopes combine with AND (OR within a kind).
- Daily stats pin exclusion generalised to any close+open of one subject at one instant.
- `test_notification_rule` ignores `is_active`, clamps the limit, returns distinct recipients.
- The crons evaluate dynamic segments that are active or still have open rule rows.
- Pending cron evaluates at `max(scheduled_time, now())` and keeps the org pending after a stale sync or a transient failure; transient failures are recorded on the segment too.
- `matching_rule_versions` has `p_check_segments` (default true); the dwell cron passes false.
- Seed: "Unknown frequent faces" uses `visits_last_30d` (the `detection_count` counter is live, wrong at past times); VIP uses `profile_type`.

## Deviations from spec

- §8.4 `segment_inputs_changed` event trigger replaced by SQL request triggers + `evaluate_segments_pending`; design updated.
- `relative_days` values, `as_of` on stats tables, `last_evaluation_error/failed_at`, `identities.age`, `segment_fields` / `segment_evaluation_context` and `segment_evaluation_requests` are additions.
- `visited_area_id` -> `top_area_id`; kind/target immutable; `aggregate_stats` of the spec is split: this slice ships `evaluate_segments` (stats + segments + segment daily stats); the analytics aggregation stays with slice 7.
- Stats metrics other than those listed in §6.10 are not computed yet.

## Deferred minors and known limits

- Watch-list entry expiry (`expires_at` passing) is time-based and is only picked up by the hourly `evaluate_segments`.
- Transient-error classification: an uncoded permanent failure is retried every minute (visible in `last_evaluation_error`); a late hourly run skips stale syncs.
- A transaction writing inputs of two organizations could deadlock at commit with a concurrent one (rare).
- Daily stats scan all membership rows hourly (demo scale). Referenced companies/areas deleted later match nothing (no re-validation).
- Seed: `pnpm seed --reset` needed for the new contractor end dates; trend shapes are thin (Frequent visitors ramps 0 -> 12 from day -17, since the replay starts at day -30 without warm-up); the segment rules have no history.
- Test gap: "facility fails but the segment matches" (covered in the final wave if added).

## Carry-overs to slice 7

- Extend `itap.refresh_activity_stats` into the real aggregation cron (`aggregate_stats`: hourly/daily/transition stats, further metrics); `segment_daily_stats` trend shapes are the input for segment reports (`report_segments`).
- Report-driven segment filters should reuse the same translator.

## Owner actions (not done by the agents)

- **SECURITY (top priority)**: the dev Postgres still carries the attacker persistence from slice 3/4 (superuser role `priv_esc`, event triggers `log_start` / `log_end` running `public.escalate_priv()`, ransom database `readme_to_recover`). Not remediated. Rebuild the volume (`make db_reset` then `pnpm seed`) or drop the triggers, function and role.
- Rotate ALL secrets: Hasura admin secret (`change-me`), JWT key, Postgres password, action secret; audit production Postgres for the same artifacts.
- Production: `WEBHOOK_ALLOW_PRIVATE_TARGETS=false`, `WEBHOOK_SINK_ENABLED=false`, `BACKEND_URL` reachable from Hasura, `ACTION_SECRET` set. Nothing is merged to `main`; production untouched.

## How to run

```bash
make dev-compose && make hasura_apply
pnpm --filter nhost metadata:generate
pnpm seed                              # --reset wipes seed data first (needed once for new contractor end dates)
pnpm --filter nhost test
pnpm --filter backend exec vitest run src
pnpm --filter backend test:integration
RUN_SEED_TEST=1 pnpm --filter backend test:integration -- seed
```

Live demo: after `pnpm seed`, edit a profile or add a member to a manual segment; within about a minute `evaluate_segments_pending` re-evaluates the dynamic segments (`last_evaluated_at`, membership rows). Use `preview_segment` for a dry run and `test_notification_rule` for the "Executive access holders" rule.
