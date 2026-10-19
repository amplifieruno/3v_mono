# Data Layer Slice 5 — Notifications, Escalation, Webhooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notification rules, templates, recipient groups, escalation policies with steps and on-call schedules, user subscriptions, deliveries and in-app inbox (Stage C fan-out from events), webhook subscriptions and signed deliveries, delivery sending (stubbed channels + real webhooks), escalation and digest crons, and seeded history.

**Architecture:** Builds on slices 1–4 (summaries 01–04; `.claude/rules/hasura-conventions.md`). Stage C runs in SQL inside `finish_events` (after events are written, before incidents' counters — keep the documented lock order) so fan-out is transactional and idempotent. External side effects (email/SMS/push stub, HTTP webhooks) go through event triggers on delivery rows → backend.

**Tech Stack:** Postgres 16, Hasura v2.46 event/cron triggers, Express/TypeScript, Node `crypto` (HMAC-SHA256), vitest.

**Spec:** `tasks/data-layer/design.md` — §6.12, §8.2 (Stage C), §8.3 (`escalate`, `send_digests`), §8.4 (`send_delivery`, `send_webhook`), §4.2 (deactivated members receive nothing; vacation delegate), §6.0 (time/windows: quiet hours).

## Global Constraints

- All conventions so far apply; `.claude/rules/hasura-conventions.md` binding.
- Channels: enum `notification_channels` (in_app, email, sms, push, webhook); rule channels and app enum sets as junction tables.
- `notification_deliveries`: exactly-one origin (rule / escalation step / subscription / report — report FK added in slice 7, column now) and exactly-one recipient (member user_id / external address); per-origin partial unique indexes (spec §6.12); append-only ro for org_admin; status enum pending/sent/delivered/failed/retrying/dead_letter; attempts; acknowledged_at (recipient can ack own in-app).
- `user_notifications` (inbox): owner-only select/update (read_at, acknowledged_at) via `user_id = X-Hasura-User-Id`; deactivated members' rows kept but no new ones.
- Recipients: only active members; quiet hours (`organization_members.quiet_hours` windows) defer non-critical email/sms/push (status pending with `deliver_after`); vacation: deliveries for a member on vacation go to `vacation_delegate_user_id` when set.
- Escalation: `escalation_policies` + `escalation_policy_steps` (step_no, after_minutes, recipient_group_id XOR on_call_schedule_id, channel); `on_call_schedules` + `on_call_schedule_members` (position) with `shift_length_hours`, `rotation_start_at`; FK `incidents.escalation_policy_id` and `event_rule_versions.escalation_policy_id` added now.
- Webhooks: `webhook_subscriptions` (url https/http, secret **secret**, is_active) + `webhook_subscription_event_types`; `webhook_deliveries` (ro) with HMAC-SHA256 signature header `x-itap-signature: sha256=<hex>` over the raw body, retries with backoff, dead_letter after N.
- Templates: `notification_templates` (channel, locale, subject, body with `{{variable}}` placeholders); rendering in SQL or backend (decide; one renderer only).
- Every cron uses scheduled_time; every handler idempotent.

## Review Focus

1. The same event redelivered by Hasura creates no duplicate deliveries or inbox rows.
2. A deactivated member in a recipient group receives nothing; a member on vacation with a delegate → delegate receives.
3. An unacknowledged critical incident escalates step by step at the configured minutes and stops once acknowledged.
4. A webhook endpoint returning 500 is retried with backoff and ends in dead_letter; the signature verifies with the subscription secret.
5. Quiet hours defer an email but never an in-app or critical delivery.

---

### Task 1: Notification configuration schema
Enums, `notification_templates`, `recipient_groups` + `recipient_group_members` (exactly-one member user / external address; channel), `escalation_policies` + `escalation_policy_steps`, `on_call_schedules` + members, `notification_rules` (code RULE? — use `NR` → choose `NOTIF`; spec FS shows `RULE-789` for notification rules: use prefix `NRULE`), `notification_rule_event_types`, `notification_rule_channels`, `notification_subscriptions` (owner-managed: user_id = session user; facility/identity/profile/watch_list/event_type filters; min_severity), FKs from incidents/event_rule_versions to escalation_policies; helper `itap.on_call_member(schedule, at)`. Tests: permissions, validation, on-call rotation math.

### Task 2: Deliveries, inbox, Stage C fan-out
`notification_deliveries`, `user_notifications`, `itap.fan_out_event(event)` called from `finish_events` (rules matching event type + conditions + priority/severity rank; subscriptions matching filters; recipients expanded from groups (active members only, vacation delegate), quiet hours → deliver_after; in-app delivered immediately into inbox; dedup via per-origin unique indexes); org_admin ack/read own inbox; `acknowledge_delivery` function. Tests: Review Focus 1, 2, 5.

### Task 3: Sending (event triggers) + webhooks
Event trigger `send_delivery` (non in-app deliveries; status transitions; email → log + optional Mailhog SMTP if configured; sms/push → stub sent/delivered; retries/backoff/dead_letter), `webhook_subscriptions`/`webhook_deliveries` + fan-out from events, event trigger `send_webhook` (real HTTP POST, HMAC signature, timeout, retries, dead_letter). Test receiver endpoint in tests (local HTTP server reachable from the backend container — use the backend itself: a test-only route under `/hasura/events/test-webhook-sink` enabled by env in dev, or a tiny sink container; choose the simplest that works in compose). Tests: Review Focus 4.

### Task 4: Escalation + digests + quiet-hours release crons
`escalate` (1 min): incidents with acknowledged_at null and status open past the current step's after_minutes since last_escalated_at (or created_at) → next step deliveries (group or on-call member), incident_activities, escalation_step bump; `release_deferred` (1 min): pending deliveries whose deliver_after passed → send; `send_digests` (hourly): digest-mode rules aggregate pending digest items into one delivery per recipient. Tests: Review Focus 3.

### Task 5: Seed + reports helpers
Seed templates (en/ru for email/in_app), groups (Security team, Facility managers, On-call), on-call rotation, escalation policy for critical incidents, notification rules (blacklist → security email+in_app, critical → on-call escalation, device_offline → facility managers), subscriptions for admin users, webhook subscription pointing at the dev sink; replay-compatible history: deliveries/inbox produced through the pipeline for the replayed events (Stage C runs during replay — verify volumes) plus webhook deliveries (sink). `delivery_report(hasura_session, from, to)` query function (volumes, ack rate, response times per channel). Tests.

### Task 6: Docs, summary, gates
CLAUDE.md, roadmap, conventions (Stage C, delivery state machine, webhook signing), `summary-05-notifications.md`; gates; push.
