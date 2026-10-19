# Data Layer Slice 6 — Segments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Segments over identities or profiles — manual and dynamic (rule-based) — with a validated condition language, a single evaluator (backend translator → Hasura `where`), membership history (closed, never deleted), daily segment stats, templates, schedules/active windows, evaluation on input changes (debounced) and hourly; segment scopes in event rules become effective.

**Architecture:** Builds on slices 1–5 (summaries; `.claude/rules/hasura-conventions.md`). Per spec §8.0 there is exactly one evaluator for the condition language: the backend translator from conditions JSON to a Hasura `where` for `profiles` or `identities`, executed with the caller's/org session so permissions apply; membership is synced atomically by SQL `sync_segment_members(segment, ids)`. Previews use the same translator via an Action.

**Tech Stack:** Postgres 16, Hasura v2.46 (actions, event and cron triggers), Express/TypeScript, zod, vitest.

**Spec:** `tasks/data-layer/design.md` — §6.5 (segments, members, templates, daily stats, field catalog), §6.10 (identity/profile activity stats — behavioral metrics), §8.0 (one evaluator), §8.3 (`evaluate_segments`), §8.4 (segment input debounce: request triggers + `evaluate_segments_pending`), §8.5 (`evaluate_segment`, `preview_segment`).

## Global Constraints

- All conventions so far apply.
- `segments`: code `SEGMENT`; kind manual/dynamic; target identities/profiles; conditions jsonb (validated by `itap.validate_condition_refs`: referenced ids belong to the org; referenced segments must be manual and same target — prevents cycles); status active/inactive/archived; active_from/active_until; schedule (windows); member_count **ro**; last_evaluated_at **ro**; template_id.
- `segment_members`: one table, `target` column + FK `(organization_id, segment_id, target)` → segments (declarative kind check); exactly one of identity/profile matching target; source manual/rule; added/removed timestamps and actors; partial unique on active rows; rows closed (`removed_at`), never deleted; manual rows never removed by evaluation.
- Behavioral metrics (`visits_last_30d`, `avg_dwell_minutes`, `last_seen_days_ago`, `top_area_id`, `after_hours_visits_30d`) come from `identity_activity_stats` / `profile_activity_stats` (slice 7 builds the real aggregation cron; this slice creates the stats tables and a simple SQL refresh function `itap.refresh_activity_stats(org, at)` computing them from tracking_sessions/identity_locations so segments work now — slice 7 reuses/extends it).
- Condition language (spec §6.5): groups `{op: and|or|not, children}`, leaves `{field, operator, value}`; field catalog per target (exact list in a shared module `packages/shared` or backend `segments/catalog.ts` — one source of truth used by validation (backend) and documented); operators per field type (eq, neq, in, nin, gt, gte, lt, lte, contains, is_null, between).
- Event rule version scopes with `segment_id`: add the FK now and make `matching_rule_versions` honor segment scopes (identity/profile membership at event time — active membership rows).

## Review Focus

1. A dynamic segment never removes a manually added member.
2. Re-evaluation is idempotent and produces exact churn history (added/removed timestamps), no duplicate active rows under concurrent evaluations.
3. A condition referencing another org's area/segment id is rejected at save time.
4. Segment cycles impossible (only manual segments referenceable).
5. A profile-target condition on behavioral metrics for a profile without identities evaluates sanely (no errors; metrics null → comparisons false).

---

### Task 1: Schema — segments, members, templates, daily stats, activity stats tables, validation
### Task 2: Translator (backend) + preview_segment / evaluate_segment actions + sync_segment_members SQL
### Task 3: Evaluation triggers — segment_inputs_changed event trigger (debounced per org), evaluate_segments hourly cron (active windows/schedules), refresh_activity_stats, segment_daily_stats aggregation; event rule segment scopes effective; notification rule conditions gain a `segment_id` key (validation in validate_notification_rule_conditions, matching in notification_conditions_match via active membership at event time) — carried from slice 5; `itap.test_notification_rule(hasura_session, rule)` dry-run against the last N events returning would-be recipients (spec §8.1) — carried from slice 5
### Task 4: Seed — templates (system), segments (Night Shift via work schedule, Frequent visitors, VIP, Contractors with expiring access, Unknown frequent faces (identity target), manual "Executive floor access"), 30-day segment daily stats history consistent with replay; tests
### Task 5: Docs, summary, gates
