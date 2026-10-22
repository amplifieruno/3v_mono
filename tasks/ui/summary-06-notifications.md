# Summary — phase 6: Notifications

Plan: `plan-06-notifications.md`. Spec: `design.md`. Framework gaps: `buro-gaps.md` (G49–G53).
Branch `feat/ui-console`, base `92da014`: rules and templates `9cbef46`, recipient groups, escalation and
on-call `7cc9ff5` + review fixes `75042b2`, subscriptions and delivery logs `833178f`, inbox and webhooks
`4d47ddb`, review follow-ups, the notifications smoke suite and this summary. Demo video:
`playwright-output/phase-06-notifications.webm` (a rule with a condition and its dry-run test, a recipient
group and an escalation policy, who is on call, a personal subscription switched off, the Failed deliveries
view and the delivery report, the header bell and the inbox, a webhook with a private-address warning;
git-ignored like the earlier videos).

## What was built

All in `apps/admin-ui/`, in a new `notifications` ConsoleModule (`src/modules/notifications/`), nav section
Notifications (Inbox, Notification rules, Notification templates, Recipient groups, Escalation policies,
On-call schedules, My subscriptions, Deliveries, Delivery report, Webhooks, Webhook deliveries).

- **Rules and templates.** `notification_rule` with priority, digest mode, recipient group, template and
  escalation policy; event types and channels are junction lists on the rule page (G49). **Test rule** opens
  the dry run of `test_notification_rule` (latest 20/50/100 events: match, or why not, and the recipients
  with names). Templates per channel and locale with placeholder checks.
- **`itap.notification-conditions` field** (`src/fields/notification-conditions*.ts(x)`): one row per
  condition of the trigger's grammar (facility, area and the areas inside it, segment, minimum severity),
  choices read from the organization, areas follow the chosen facility, a stale id is flagged on its row.
- **Audiences.** Recipient groups with people and external addresses as two resources over one table
  (G45, email or SMS for addresses), escalation policies with group steps and on-call steps (two resources
  over `escalation_policy_steps`; "Passes at most" shown only while "repeat" is on), on-call schedules with a
  rotation list. Computed fields `on_call_schedules.on_call_user_id` / `shift_ends_at` show whom an on-call
  step would page now (it is the function the `escalate` cron calls).
- **Subscriptions and deliveries.** "My subscriptions" (own rows only; switch off instead of delete, since a
  delete would take the deliveries along), the append-only **Deliveries** log (cursor paging, manual count;
  views Failed, Dead letters, Mine; computed `origin`, `title`, `to_me`, `escalation_policy_id`), the
  **Delivery report** page (7 days / 24 hours / 30 days facts and a per-channel table), and Notifications tabs
  on rules, incidents and events.
- **Inbox and bell.** `user_notification` (Mark read, Acknowledge, Mark all read; acknowledging an escalation
  page acknowledges its incident and rereads it and its timeline) and `InboxBell` in the header (unread
  count, latest five, polling every 30 s).
- **Webhooks.** `webhook_subscription` (write-only signing secret, G53) and the `webhook_delivery` log with
  Request and Response tabs. The address rules (`webhook-url.ts`) restate the database CHECK as errors
  (link-local, 0.0.0.0, credentials, format) and the sender's guard (`apps/backend/src/webhooks/target.ts`)
  as warnings: loopback/private ranges, and ranges never called (0.0.0.0/8, `::`, link-local), also written
  as a number (`http://2130706433`) or an IPv4-mapped address (`::ffff:7f00:1`).
- **Subset channel enums.** `notification_person_channel` and `notification_address_channel` (console-only)
  because buro's enum picker lists the whole enum (G52); the webhook channel is never offered where the
  database refuses it.
- **Refusal maps** for `acknowledge_notification` and the mark-read calls; all are in the `ACTION_REFUSALS`
  key-list test.
- **Data layer, migrations `1792365700279`–`282`:** 279 on-call computed fields; 280 trigger clearing
  `escalation_policies.max_cycles` when "repeat" is off; 281 computed delivery fields; 282
  `mark_notifications_read` with no ids marks all own unread rows.

## Reusable for later phases

- The conditions editor pattern (a structured jsonb field with references read from the organization and a
  per-row issue path) for segments (phase 7, a different grammar, so a separate field).
- `InboxBell` / `itap:inbox-summary` and its `reads` for refresh after any inbox mutation.
- Subset enum registration beside the full enum; computed Hasura columns instead of per-session saved-view
  values; the twin-resource pattern for either/or columns.

## Rulings (from the ledger)

- Task 1 registered minimal read-only group and policy resources before Task 2 extended them.
- An incident's escalation policy stays editable (the data layer allows it).
- `max_cycles` is cleared by a database trigger (migration 280) when "repeat" is off, since buro cannot send
  `null` for a hidden field and the server ignored the value anyway.
- Webhook address problems that the database accepts but the sender never sends to are warnings, not errors.
- The test-rule dry run lists non-matching events too, with their reason; the e2e asserts both sides.

## Found by the smoke suite

- The Failed view had no seeded rows (no failed delivery in the dev seed); the suite adds one with the admin
  secret and removes it.
- Enum options in forms carry their help text in the accessible name; the suite selects them by prefix.

## Framework gaps met (G49–G53)

- G49 a link cannot target an enum (enum-set junctions).
- G50 a record form cannot place a database refusal on a node of a structured field.
- G51 a related list cannot reorder its rows.
- G52 an enum picker lists the whole enum, not the field's values (subset enums).
- G53 a field cannot be required on create only (secret).

## Deferred minors

- Restore read time fallback in the inbox dev test (the original read time is not preserved).
- Validator casts (G14/G33 family).
- `report_id` of a delivery is an id until the reports resource of phase 8; duplicate report calls on the
  report page.
- A computed title for subscriptions that have only filters.
- Reordering steps and rotation members is by number (G51); the bell has no "Mark all read" of its own.

## Known limits

- A webhook to a host name is checked only when sending (DNS); the console warns about literal addresses.
- The seed has no failed delivery; the Failed view is exercised with a row the e2e creates.
- A record deleted between loading and saving a rule still ends in "Validation failed" (G48/G50).

## Gates

Unit/jsdom 678 passed (90 dev-stack skipped, 113 files); with `ITAP_DEV_STACK=1` 768 passed (113 files);
e2e 49 passed (notifications 8, monitoring 7, people 6, places 7, and the earlier specs). Lint, typecheck and
build clean.

## How to run

```bash
make dev-compose && pnpm seed                      # dev stack and demo data
pnpm --filter admin-ui dev                         # console on http://127.0.0.1:5173
pnpm --filter admin-ui lint && pnpm --filter admin-ui typecheck
pnpm --filter admin-ui test                        # unit/jsdom
ITAP_DEV_STACK=1 SEED_PASSWORD=... GRAPHQL_ADMIN_SECRET=... pnpm --filter admin-ui test       # + dev-stack tests
ITAP_DEV_STACK=1 SEED_PASSWORD=... GRAPHQL_ADMIN_SECRET=... pnpm --filter admin-ui test:e2e   # + notifications smoke
pnpm --filter admin-ui build
```

`SEED_PASSWORD` and `GRAPHQL_ADMIN_SECRET` are in `apps/backend/.env`. Sign-in is limited to ten per five
minutes; leave about five minutes between a dev-stack run and an e2e run.
