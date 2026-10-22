# ITAP Console Phase 6 — Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Who gets told what, how and when: notification rules (conditions, event types, channels,
digests), templates, recipient groups, escalation policies with on-call rotations, personal
subscriptions, the in-app inbox, delivery logs and webhooks.

**Architecture:** A new `notifications` ConsoleModule (conventions: latest summaries +
`IMPLEMENTER-CONTEXT.md`). Enum-set junctions (rule event types, rule channels, webhook event types)
are read links (`f.relationMany({ through })`) with junction relatedLists for editing until buro
ships link writes. Conditions use a reusable `notificationConditions` field type (rule-language JSON,
validated like the DB trigger). The inbox is the header bell: a buro app action / shell slot reading
`user_notifications` with polling, plus an Inbox page.

**Spec:** `tasks/ui/design.md`; data model `tasks/data-layer/design.md` §6.12, §8.3 (`retry_deliveries`,
`escalate`, `send_digests`), §8.4 (`send_delivery`, `send_webhook`), query `test_notification_rule`.

## Global Constraints

- Earlier Global Constraints and `IMPLEMENTER-CONTEXT.md` apply.
- Channels never include `webhook` on rules, escalation steps or subscriptions (DB CHECK) — the
  channel pickers exclude it there.
- `webhook_subscriptions.secret` is a secret column → the phase-3 `secret()` field.
- Deliveries and webhook deliveries are read-only logs (noAggregate, count manual, cursor).
- Quiet hours / schedules reuse `timeWindows({ emptyText })`; timezones reuse `timezone()`.
- Exactly-one constraints (group member user vs external address; escalation step group vs on-call
  schedule; subscription targets) are expressed with record types or conditional fields (`when`) so
  the form never offers an invalid combination.

## Review Focus

1. Testing a rule (`test_notification_rule`) against the last N events shows which would have matched
   and to whom, without sending anything. — Task 1 test.
2. A recipient group member with neither a user nor an address cannot be saved. — Task 2 test.
3. Acknowledging an escalation page in the inbox also acknowledges its incident (server behaviour),
   and the inbox and incident refresh. — Task 4 test.
4. A webhook with a private-network URL is refused with the server's SSRF message in prod mode (or
   allowed in dev with the flag) and the UI shows why. — Task 4 test.
5. Marking all notifications read only affects the current user. — Task 4 test.

---

### Task 1: Notification rules and templates
Rules (conditions field, priority, recipient group, template, escalation policy, active, digest mode;
event types and channels via links + junction lists), "Test rule" flow over `test_notification_rule`
with results shown in a block, templates (channel, locale, subject, body with placeholder help, system
templates read-only). Commit `feat(ui): notification rules and templates`.

### Task 2: Recipient groups, escalation policies, on-call schedules
Groups + members (user or external address + channel), escalation policies (repeat, max cycles) + ordered
steps (after minutes, group or on-call schedule, channel), on-call schedules (timezone, shift length,
rotation start) + ordered members, a "Who is on call now" fact computed client-side from rotation or via a
query if one exists. Commit `feat(ui): recipient groups, escalation and on-call`.

### Task 3: Subscriptions and delivery logs
My subscriptions (self-service: event type, facility, person, watch list, channel, min severity,
active), notification deliveries log (status, channel, recipient, origin, attempts, error; saved views
Failed/Dead letters), delivery report via `delivery_report` (facts + table block). Commit
`feat(ui): subscriptions and delivery logs`.

### Task 4: Inbox and webhooks
Header bell with unread count (polling) and dropdown, Inbox page (mark read, mark all read via
`mark_notifications_read`, acknowledge via `acknowledge_notification`), webhook subscriptions (URL,
secret, event types, active, last delivery status) + webhook deliveries log with request/response view.
Commit `feat(ui): inbox and webhooks`.

### Task 5: Phase close
e2e `notifications.spec.ts`, gates, demo `phase-06-notifications.webm`, `summary-06-notifications.md`,
gaps/roadmap, push.
