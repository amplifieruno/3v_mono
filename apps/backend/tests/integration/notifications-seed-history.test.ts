import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { asAdmin } from './support/clients.js';
import { escalationPolicy } from './support/escalation.js';
import { expectDenied } from './support/fixtures.js';
import { notificationRule, notificationWorld, recipientGroup } from './support/notifications.js';
import { callFn, createIncident, insertOne } from './support/operations.js';
import { SINK_URL, secondsBetween } from './support/sending.js';
import { runSql, runSqlRows } from './support/sql.js';
import { at } from './support/tracking.js';

/**
 * Seed-only history helpers (slice 5, task 5): seed_finalize_notifications dates the notification rows a replayed
 * transaction wrote at their simulated time and settles them as the stub providers would have; seed_escalate_incident
 * escalates one incident at a simulated instant. Both are admin-secret only.
 */
const FINALIZE = `seed_finalize_notifications(args: {p_organization: $o, p_until: $until}) { id }`;

async function deliveries(orgId: string): Promise<Record<string, string | null>[]> {
  return runSqlRows(
    `select d.id, d.rule_id, d.channel, d.status, d.attempts::text, d.error, d.recipient_address, d.recipient_user_id,
            d.created_at, d.sent_at, d.delivered_at, d.acknowledged_at, d.digested_into, d.escalation_cycle::text,
            d.content ->> 'item_count' as item_count
       from itap.notification_deliveries d where d.organization_id = '${orgId}'
      order by d.created_at, d.channel, d.recipient_address`,
  );
}

/** Replays one detection like a seeded history day: insert, Stage B (+ Stage C) and finalize in ONE transaction. */
async function replayDetection(w: Awaited<ReturnType<typeof notificationWorld>>): Promise<void> {
  const id = randomUUID();
  await asAdmin().request(
    `mutation($d: detections_insert_input!, $id: uuid!, $o: uuid!, $until: timestamptz!) {
      d: insert_detections_one(object: $d) { id }
      e: evaluate_detection(args: {p_detection: $id}) { id }
      f: ${FINALIZE}
    }`,
    {
      d: { id, organization_id: w.orgA.id, device_id: w.lobbyCam.id, identity_id: w.identity, detected_at: at(0), confidence: 0.9 },
      id,
      o: w.orgA.id,
      until: new Date().toISOString(),
    },
  );
}

describe('seed history notifications', () => {
  it('should date replayed deliveries, inbox and webhooks at the event time and settle them like the stubs', async () => {
    const w = await notificationWorld();
    const group = await recipientGroup(w.a, [
      { user_id: w.user.id, channel: 'in_app' },
      { external_address: 'ops@example.com', channel: 'email' },
      { external_address: 'old-desk@nova.invalid', channel: 'email' },
    ]);
    const rule = await notificationRule(w.a, ['detection_unknown'], ['in_app', 'email'], { recipient_group_id: group, priority: 'high' });
    const digestGroup = await recipientGroup(w.a, [{ external_address: 'digest@example.com', channel: 'email' }]);
    const digestRule = await notificationRule(w.a, ['detection_unknown'], ['email'], { recipient_group_id: digestGroup, digest_mode: 'hourly' });
    await insertOne(w.a, 'webhook_subscriptions', {
      url: SINK_URL,
      secret: 'seed-history-secret-0123456789',
      webhook_subscription_event_types: { data: [{ event_type: 'detection_unknown' }] },
    });

    await replayDetection(w);
    // The send_delivery / send_webhook triggers fire after commit: they must find nothing left to send.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const occurred = at(0);
    const rows = await deliveries(w.orgA.id);
    const byRule = rows.filter((d) => d.rule_id === rule);

    const inApp = byRule.find((d) => d.channel === 'in_app');
    expect(inApp).toMatchObject({ status: 'delivered', created_at: expect.any(String) });
    expect(Date.parse(inApp?.created_at ?? '')).toBe(Date.parse(occurred));
    expect(Date.parse(inApp?.sent_at ?? '')).toBe(Date.parse(occurred));
    expect(Date.parse(inApp?.delivered_at ?? '')).toBe(Date.parse(occurred));

    const sent = byRule.find((d) => d.recipient_address === 'ops@example.com');
    expect(sent).toMatchObject({ status: 'sent', attempts: '1', error: 'NULL', delivered_at: 'NULL' });
    expect(Date.parse(sent?.created_at ?? '')).toBe(Date.parse(occurred));
    const lag = secondsBetween(occurred, sent?.sent_at ?? '');
    expect(lag).toBeGreaterThanOrEqual(5);
    expect(lag).toBeLessThanOrEqual(40);

    const dead = byRule.find((d) => d.recipient_address === 'old-desk@nova.invalid');
    expect(dead).toMatchObject({ status: 'dead_letter', attempts: '5', sent_at: 'NULL' });
    expect(dead?.error).toContain('.invalid');

    // Hourly digest: the item is digested into a combined delivery dated at the end of its window, then sent.
    const digest = rows.filter((d) => d.rule_id === digestRule);
    const item = digest.find((d) => d.status === 'digested');
    const combined = digest.find((d) => d.id === item?.digested_into);
    expect(Date.parse(item?.created_at ?? '')).toBe(Date.parse(occurred));
    expect(combined).toMatchObject({ status: 'sent', attempts: '1', item_count: '1' });
    expect(Date.parse(combined?.created_at ?? '')).toBe(Date.parse(occurred) + 3_600_000);

    // Inbox row at the event time; older than a day and high priority: read and acknowledged 1-10 minutes later.
    const [inbox] = await runSqlRows(
      `select n.created_at, n.read_at, n.acknowledged_at, d.acknowledged_at as delivery_ack
         from itap.user_notifications n join itap.notification_deliveries d on d.id = n.delivery_id
        where n.organization_id = '${w.orgA.id}'`,
    );
    expect(Date.parse(inbox.created_at ?? '')).toBe(Date.parse(occurred));
    const response = secondsBetween(occurred, inbox.acknowledged_at ?? '');
    expect(response).toBeGreaterThanOrEqual(60);
    expect(response).toBeLessThanOrEqual(600);
    expect(inbox.read_at).toBe(inbox.acknowledged_at);
    expect(inbox.delivery_ack).toBe(inbox.acknowledged_at);

    const [hook] = await runSqlRows(
      `select status, attempts::text, response_code::text, created_at, sent_at, next_attempt_at, error,
              (select last_delivery_status from itap.webhook_subscriptions s where s.id = w.subscription_id) as last_status
         from itap.webhook_deliveries w where organization_id = '${w.orgA.id}'`,
    );
    expect(hook).toMatchObject({ status: 'sent', attempts: '1', response_code: '200', next_attempt_at: 'NULL', error: 'NULL', last_status: 'sent' });
    expect(Date.parse(hook.created_at ?? '')).toBe(Date.parse(occurred));
    expect(secondsBetween(occurred, hook.sent_at ?? '')).toBeGreaterThanOrEqual(1);
    expect(secondsBetween(occurred, hook.sent_at ?? '')).toBeLessThanOrEqual(3);
  });

  it('should keep the delivery guards in force outside the seed function', async () => {
    const w = await notificationWorld();
    const group = await recipientGroup(w.a, [{ user_id: w.user.id, channel: 'in_app' }]);
    await notificationRule(w.a, ['detection_unknown'], ['in_app'], { recipient_group_id: group });
    await replayDetection(w);
    const [row] = await deliveries(w.orgA.id);
    const backdate = `update itap.notification_deliveries set created_at = created_at - interval '1 day' where id = '${row.id}'`;
    await expect(runSql(backdate)).rejects.toThrow(/notification_delivery_immutable/);
    // The flag is reset when the function returns, also within the same transaction.
    await expect(
      runSql(`select count(*) from itap.seed_finalize_notifications('${w.orgA.id}', now()); ${backdate}`),
    ).rejects.toThrow(/notification_delivery_immutable/);
    await expect(
      runSql(`update itap.user_notifications set read_at = '2020-01-01' where organization_id = '${w.orgA.id}'`),
    ).resolves.toBeUndefined();
    const [inbox] = await runSqlRows(`select read_at from itap.user_notifications where organization_id = '${w.orgA.id}'`);
    expect(Date.parse(inbox.read_at ?? '')).toBeGreaterThan(Date.parse('2025-01-01'));
  });

  it('should escalate an incident at simulated instants and date its deliveries', async () => {
    const w = await notificationWorld();
    const group = await recipientGroup(w.a, [
      { user_id: w.user.id, channel: 'in_app' },
      { external_address: 'oncall@example.com', channel: 'email' },
    ]);
    const policy = await escalationPolicy(w.a, [
      { after_minutes: 0, channel: 'in_app', recipient_group_id: group },
      { after_minutes: 0, channel: 'email', recipient_group_id: group },
    ], true);
    // Acknowledged first and without a policy: the live escalate cron never considers it.
    const incident = await createIncident(w.a, { severity: 'critical', escalation_policy_id: null });
    await callFn(w.a, 'acknowledge_incident', { p_incident: incident.id }, 'id');
    const t1 = new Date(Date.now() - 30 * 60_000).toISOString();
    const t2 = new Date(Date.now() - 29 * 60_000).toISOString();
    await asAdmin().request(
      `mutation($i: uuid!, $p: uuid!, $t1: timestamptz!, $t2: timestamptz!, $o: uuid!, $until: timestamptz!) {
        e1: seed_escalate_incident(args: {p_incident: $i, p_policy: $p, p_at: $t1}) { id }
        e2: seed_escalate_incident(args: {p_incident: $i, p_policy: $p, p_at: $t2}) { id }
        f: ${FINALIZE}
      }`,
      { i: incident.id, p: policy.id, t1, t2, o: w.orgA.id, until: new Date().toISOString() },
    );

    const [state] = await runSqlRows(
      `select escalation_step::text, escalation_policy_id, last_escalated_at, status from itap.incidents where id = '${incident.id}'`,
    );
    expect(state).toMatchObject({ escalation_step: '2', escalation_policy_id: policy.id, status: 'acknowledged' });
    expect(Date.parse(state.last_escalated_at ?? '')).toBe(Date.parse(t2));
    const activities = await runSqlRows(
      `select occurred_at, actor_id, details ->> 'step' as step, details ->> 'manual' as manual, details ->> 'channel' as channel
         from itap.incident_activities where incident_id = '${incident.id}' and kind = 'escalated' order by occurred_at`,
    );
    expect(activities.map((a) => [Date.parse(a.occurred_at ?? ''), a.actor_id, a.step, a.manual, a.channel])).toEqual([
      [Date.parse(t1), 'NULL', '1', 'false', 'in_app'],
      [Date.parse(t2), 'NULL', '2', 'false', 'email'],
    ]);
    const rows = await deliveries(w.orgA.id);
    const inApp = rows.find((d) => d.channel === 'in_app');
    const email = rows.find((d) => d.channel === 'email' && d.recipient_address === 'oncall@example.com');
    expect(Date.parse(inApp?.created_at ?? '')).toBe(Date.parse(t1));
    expect(email).toMatchObject({ status: 'sent', attempts: '1', escalation_cycle: '0' });
    expect(Date.parse(email?.created_at ?? '')).toBe(Date.parse(t2));
    // Younger than a day: the inbox row stays unread.
    const [inbox] = await runSqlRows(`select created_at, read_at from itap.user_notifications where incident_id = '${incident.id}'`);
    expect(Date.parse(inbox.created_at ?? '')).toBe(Date.parse(t1));
    expect(inbox.read_at).toBe('NULL');
  });

  it('should read but not acknowledge old inbox rows of an incident still open and unacknowledged', async () => {
    const w = await notificationWorld();
    const group = await recipientGroup(w.a, [{ user_id: w.user.id, channel: 'in_app' }]);
    // One step, no repeat: after it the policy has ended, so the live cron never escalates these incidents again.
    const policy = await escalationPolicy(w.a, [{ after_minutes: 0, channel: 'in_app', recipient_group_id: group }]);
    const open = await createIncident(w.a, { severity: 'critical', escalation_policy_id: null });
    const acked = await createIncident(w.a, { severity: 'critical', escalation_policy_id: null });
    await callFn(w.a, 'acknowledge_incident', { p_incident: acked.id }, 'id');
    const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
    await asAdmin().request(
      `mutation($open: uuid!, $acked: uuid!, $p: uuid!, $t: timestamptz!, $o: uuid!, $until: timestamptz!) {
        e1: seed_escalate_incident(args: {p_incident: $open, p_policy: $p, p_at: $t}) { id }
        e2: seed_escalate_incident(args: {p_incident: $acked, p_policy: $p, p_at: $t}) { id }
        f: ${FINALIZE}
      }`,
      { open: open.id, acked: acked.id, p: policy.id, t: old, o: w.orgA.id, until: new Date().toISOString() },
    );
    const rows = await runSqlRows(
      `select incident_id, read_at, acknowledged_at from itap.user_notifications where organization_id = '${w.orgA.id}'`,
    );
    const of = (id: string) => rows.find((r) => r.incident_id === id);
    expect(of(open.id)?.read_at).not.toBe('NULL');
    expect(of(open.id)?.acknowledged_at).toBe('NULL');
    expect(of(acked.id)?.acknowledged_at).not.toBe('NULL');
  });

  it('should keep read and acknowledgement times set once while the seed flag is on', async () => {
    const w = await notificationWorld();
    const group = await recipientGroup(w.a, [{ user_id: w.user.id, channel: 'in_app' }]);
    await notificationRule(w.a, ['detection_unknown'], ['in_app'], { recipient_group_id: group, priority: 'critical' });
    await replayDetection(w);
    const [before] = await runSqlRows(`select id, read_at, acknowledged_at from itap.user_notifications where organization_id = '${w.orgA.id}'`);
    expect(before.acknowledged_at).not.toBe('NULL');
    const [after] = await runSqlRows(`select set_config('itap.seed_context', 'on', true);
      update itap.user_notifications set read_at = '2020-01-01', acknowledged_at = '2020-01-01' where id = '${before.id}';
      select read_at, acknowledged_at from itap.user_notifications where id = '${before.id}'`);
    expect(after).toEqual({ read_at: before.read_at, acknowledged_at: before.acknowledged_at });
  });

  it('should be callable with the admin secret only', async () => {
    const w = await notificationWorld();
    await expectDenied(
      w.a.request(`mutation($o: uuid!, $until: timestamptz!) { ${FINALIZE} }`, { o: w.orgA.id, until: new Date().toISOString() }),
      'seed_finalize_notifications',
    );
    const incident = await createIncident(w.a, { escalation_policy_id: null });
    await expectDenied(
      w.a.request(`mutation($i: uuid!) { seed_escalate_incident(args: {p_incident: $i, p_at: "2026-01-01T00:00:00Z"}) { id } }`, {
        i: incident.id,
      }),
      'seed_escalate_incident',
    );
  });
});
