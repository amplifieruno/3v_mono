# Slice 5 summary: Notifications, escalation, on-call, subscriptions, webhooks (Stage C)

Branch `feat/data-layer-foundation`: commits `fdedcee..HEAD` (`15eb772` .. `ac8cd82` plus the Task 6 docs/gates commit). Spec: `design.md` (§6.12, §8.2-8.4); plan: `plan-05-notifications.md`.

## What was built

- **Configuration schema**: `notification_templates` (en/ru; rendered by the single SQL renderer `itap.render_template`, single-pass `{{var}}`), `recipient_groups` + members (user or external address), `escalation_policies` (+ `repeat`, `max_cycles`) and `escalation_policy_steps`, `on_call_schedules` + members (rotation by `shift_length_hours`, expired members skipped), `notification_rules` (code prefix `NRULE`, event types, channels, `conditions` limited to `{facility_id, area_id, min_severity}` with a validation trigger, digest mode, quiet hours via the organization timezone), `notification_subscriptions` (personal, `is_active`, channel never webhook).
- **Deliveries and inbox**: `notification_deliveries` (read-only, exactly-one origin and recipient, per-origin partial unique indexes, status machine guard, `deliver_after`) and `user_notifications` (owner-only select/update; read/ack stamped by trigger, ack copied to the delivery); actions `acknowledge_notification` / `mark_notifications_read`.
- **Stage C** (`itap.fan_out_event(s)`): runs inside `finish_events` AFTER incident creation and rule counters, i.e. at the end of the lock order (event keys -> incident counter -> rule rows -> delivery / inbox / webhook rows); also called by `emit_device_event`. Rules: group members on rule channels (active, unexpired, vacation delegate), subscriptions, in_app delivered at once, others pending; quiet hours and digest deferral (never for critical).
- **Sending**: lease-based claim (keeps `pending`/`retrying`, `attempts + 1`, `deliver_after = now() + 60 s`, original time in `content.scheduled_for`), attempt-guarded finish, 5 attempts then `dead_letter`; the due function covers pending + retrying rows incl. expired leases, never-triggered rows and quiet-hours releases. Event trigger `send_delivery` (email log-only stub; sms/push stubbed delivered) and cron `retry_deliveries` (1 min, tolerance 120).
- **Webhooks**: `webhook_subscriptions` (secret write-only, URL validated), `webhook_subscription_event_types`, `webhook_deliveries` (read-only log, body built at fan-out). Event trigger `send_webhook` signs with HMAC-SHA256 (`x-itap-signature`), 10 s timeout, no redirects, DNS check blocks link-local/metadata (and loopback/private unless `WEBHOOK_ALLOW_PRIVATE_TARGETS`), backoff 30 s / 2 min / 10 min / 30 min, 5 attempts then `dead_letter`; cron `retry_webhooks`. Dev sink `/hasura/events/webhook-sink` (env `WEBHOOK_SINK_ENABLED`).
- **Escalation**: `itap.escalate_one` (shared by cron and manual `escalate_incident`), `itap.escalate_incidents` + cron `escalate` (1 min, tolerance 120): unacknowledged open incidents take the next step when its `after_minutes` passed; one step per incident per run; repeat cycles via `escalation_step` mod steps, bounded by `max_cycles`; on-call member resolved at the time; idempotent per step/incident/cycle/recipient; activity `escalated` (with `details.reason` `no_active_recipients` / `no_on_call_member`).
- **Digests**: `itap.send_digests` + hourly cron `send_digests` (tolerance 3600): due items combined per rule, recipient, channel and window (UTC hour / organization day) into one normally-sent delivery; items get status `digested` with `digested_into`.
- **Reporting**: `itap.delivery_report(from, to)` (org_admin) -> per channel total/pending/sent/delivered/failed/dead_letter/digested/acknowledged, in_app ack rate, average response seconds, escalations (webhook rows included; total excludes digested items).
- **Seed**: Nova Tower notification configuration before the replay (templates, Security team / Facility managers / On-call groups, 12 h on-call rotation of three members incl. new user `operator@itap.demo`, "Critical incidents" policy with `max_cycles = 3`, NRULE rules, subscriptions, webhook subscription to the dev sink only when `WEBHOOK_SINK_ENABLED`); the replay finalizes notifications at simulated times; the newest critical incident (demo incident, INCIDENT-00006) stays open and escalates live a few minutes after seeding. The escalating policy is attached to a blacklist-only critical rule ("Blacklist match"); "Watch-list match" does not escalate.
- Audit: `audit_log` select for org_admin hides personal entities (`notification_subscriptions`, `operator_workspaces`, `user_notifications`) unless the row's `user_id` is the caller; NULL-actor audit rows of those entities are hidden from every org_admin (fails closed).

## Rulings (from the ledger)

- Stage C runs in `finish_events` after incident creation and rule counters (end of the lock order); deliveries can reference the incident.
- Notification rule code prefix `NRULE`; condition language `{facility_id, area_id, min_severity}`; quiet hours use the organization timezone.
- Seeded open incidents get `last_escalated_at` so the cron does not burst for history.
- Webhook sink only with `WEBHOOK_SINK_ENABLED` (dev true, prod false), in-memory, 2000 requests.
- Email log-only (no mail server); webhook backoff 30 s/2 min/10 min/30 min, 5 attempts -> `dead_letter`; 169.254.0.0/16 blocked.
- Audit_log hides personal entities unless own; NULL-actor rows on them hidden from all admins.
- Rules and steps that delivered cannot be deleted: deactivate (`is_active`); steps are edited in place. Subscriptions get `is_active` so unsubscribing keeps history (cascade only on hard delete); no rule audience = no deliveries.
- Lease pattern for notification deliveries (see Sending); `WEBHOOK_ALLOW_PRIVATE_TARGETS` dev true / prod false; DNS lookup timeout 5 s; `itap.webhook_body` STABLE.
- At most one escalation step per incident per cron run; shared `escalate_one`; manual escalation of an acknowledged (not resolved/closed) incident still sends the step (operator intent), the cron skips acknowledged.
- `escalation_policies.max_cycles` (NULL = unbounded, >= 1); seed uses 3; policy only on a blacklist-only critical rule.
- `delivery_report` counts `webhook_deliveries`; seed flag `itap.seed_context` only skips the now() stamping of inbox rows and the delivery guards; the 4th seed user `operator@itap.demo` accepted (3-member rotation).
- Digest hourly boundary `date_trunc('hour', occurred_at, 'UTC')`; digest candidates locked and collected in one statement; digest items of members inactive at digest time -> `dead_letter` `recipient_inactive`.

## Deviations from plan / spec drift

- Delivery statuses are `pending/sent/delivered/failed/retrying/dead_letter` plus the terminal `digested` (with `digested_into`); `design.md` §6.12 updated accordingly.
- `escalation_policies.max_cycles` added (not in the spec); `design.md` §6.12 updated.
- Tasks 1, 3, 4, 5 each needed one fix round; Task 2 none beyond review notes.
- Known flake: tracking-crons "races a detection" test under full-suite load (seen again).

## Deferred minors

- T2: per-event fixed cost when nothing matches; hot row `last_triggered_at`; existing rules are not re-validated.
- T3: `webhook_subscriptions` hot row per finish; zero-type subscription semantics (matches nothing? see tests); claim-to-dead_letter leaves `error` NULL.
- T4: edited steps can drop a tier; Stage C uses `now()` while escalation uses the scheduled `p_at`; digest body is plain text.
- T5: inbox rows of non-escalating acknowledged incidents are read-only (finalization precedes ack).

## Carry-overs

- `notification_deliveries.report_id` FK -> slice 7 (reports).
- Segment-scoped notification rule conditions -> slice 6 (as with event rule scopes).
- Email provider (mail server) and real sms/push providers: stubs.

## Owner actions (not done by the agents)

- **SECURITY (top priority)**: the dev Postgres still carries the attacker persistence from slice 3/4 (superuser role `priv_esc`, event triggers `log_start` / `log_end` running `public.escalate_priv()`, ransom database `readme_to_recover`). Not remediated. Rebuild the volume (`make db_reset` then `pnpm seed`) or drop the triggers, function and role.
- Rotate ALL secrets: Hasura admin secret (`change-me`), JWT key, Postgres password, action secret; audit production Postgres for the same artifacts.
- Production: `WEBHOOK_ALLOW_PRIVATE_TARGETS=false`, `WEBHOOK_SINK_ENABLED=false`, `BACKEND_URL` reachable from Hasura, `ACTION_SECRET` set. Nothing is merged to `main`; production untouched.

## How to run

```bash
make dev-compose && make hasura_apply
pnpm --filter nhost metadata:generate
pnpm seed                              # --reset wipes seed data first
pnpm --filter nhost test               # generator
pnpm --filter backend exec vitest run src
pnpm --filter backend test:integration
RUN_SEED_TEST=1 pnpm --filter backend test:integration -- seed
```

Live demo: after `pnpm seed` the newest open critical incident (INCIDENT-00006) escalates every few minutes (policy "Critical incidents", at most 3 cycles) into the on-call member's inbox and `incident_activities`. Webhook sink (dev, `WEBHOOK_SINK_ENABLED=true`): the seeded webhook subscription posts signed events to `/hasura/events/webhook-sink`; inspect `webhook_deliveries` for status. `delivery_report` shows per-channel statistics.
