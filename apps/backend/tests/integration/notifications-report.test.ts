import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { HasuraClient } from '../../src/hasura/client.js';
import { asOrgAdmin } from './support/clients.js';
import { escalationPolicy } from './support/escalation.js';
import { createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';
import { member, notificationRule, recipientGroup } from './support/notifications.js';
import { insertOne } from './support/operations.js';
import { runSql } from './support/sql.js';

/** itap.delivery_report (slice 5, task 5): per-channel delivery volumes, acknowledgement rate and response time. */
type ReportRow = {
  organization_id: string;
  channel: string;
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  failed: number;
  dead_letter: number;
  digested: number;
  acknowledged: number;
  ack_rate: number | null;
  avg_response_seconds: number | null;
  escalations: number;
};
const FIELDS = `organization_id channel total pending sent delivered failed dead_letter digested acknowledged ack_rate
  avg_response_seconds escalations`;

const FROM = '2026-03-01T00:00:00Z';
const TO = '2026-03-08T00:00:00Z';
const IN = '2026-03-02T10:00:00Z';

async function report(client: HasuraClient, from = FROM, to = TO): Promise<ReportRow[]> {
  const data = await client.request<{ delivery_report: ReportRow[] }>(
    `query($f: timestamptz!, $t: timestamptz!) { delivery_report(args: {p_from: $f, p_to: $t}) { ${FIELDS} } }`,
    { f: from, t: to },
  );
  return data.delivery_report;
}

type Row = {
  channel: string;
  status: string;
  origin?: { rule?: string; step?: string; subscription?: string };
  user?: string;
  createdAt?: string;
  ackAfterSeconds?: number;
};

/** Inserts delivery rows directly (no triggers: nothing gets sent), as the writers would have left them. */
async function insertRows(orgId: string, rows: Row[]): Promise<void> {
  const ids = rows.map(() => randomUUID());
  const values = rows.map((r, i) => {
    const created = r.createdAt ?? IN;
    const ack = r.ackAfterSeconds === undefined ? 'NULL' : `'${created}'::timestamptz + interval '${r.ackAfterSeconds} seconds'`;
    const recipient = r.user ? `'${r.user}', NULL` : `NULL, 'x${randomUUID().slice(0, 8)}@example.com'`;
    // A digest item points at another delivery of the batch (its combined row in real data).
    const digested = r.status === 'digested' ? `'${ids[0]}'` : 'NULL';
    return `('${ids[i]}', '${orgId}', ${r.origin?.rule ? `'${r.origin.rule}'` : 'NULL'}, ${r.origin?.step ? `'${r.origin.step}', 0` : 'NULL, NULL'},
      ${r.origin?.subscription ? `'${r.origin.subscription}'` : 'NULL'}, '${randomUUID()}', ${recipient}, '${r.channel}', '${r.status}',
      '${created}', ${ack}, ${digested})`;
  });
  await runSql(`SET LOCAL session_replication_role = replica;
    insert into itap.notification_deliveries (id, organization_id, rule_id, escalation_step_id, escalation_cycle, subscription_id,
      event_id, recipient_user_id, recipient_address, channel, status, created_at, acknowledged_at, digested_into)
    values ${values.join(',\n')}`);
}

/** Webhook deliveries of a subscription, no triggers (nothing gets sent). */
async function insertWebhooks(orgId: string, subscription: string, rows: { status: string; createdAt?: string }[]): Promise<void> {
  const values = rows.map(
    (r) => `('${orgId}', '${subscription}', '${randomUUID()}', 'blacklist_match', '{}'::jsonb, '${r.status}', '${r.createdAt ?? IN}')`,
  );
  await runSql(`SET LOCAL session_replication_role = replica;
    insert into itap.webhook_deliveries (organization_id, subscription_id, event_id, event_type, body, status, created_at)
    values ${values.join(',\n')}`);
}

const zero = { total: 0, pending: 0, sent: 0, delivered: 0, failed: 0, dead_letter: 0, digested: 0, acknowledged: 0, escalations: 0 };

describe('delivery_report', () => {
  it('should aggregate deliveries per channel in the period for the session organization', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const colleague = await member(orgA.id);
    const group = await recipientGroup(a, [{ user_id: user.id, channel: 'in_app' }]);
    const rule = await notificationRule(a, ['blacklist_match'], ['in_app', 'email'], { recipient_group_id: group });
    const policy = await escalationPolicy(a, [{ after_minutes: 0, channel: 'sms', recipient_group_id: group }]);
    const subscription = await insertOne(asOrgAdmin(colleague, orgA.id), 'notification_subscriptions', {
      event_type: 'blacklist_match',
      channel: 'in_app',
    });
    const byRule = { rule };
    await insertRows(orgA.id, [
      { channel: 'in_app', status: 'delivered', origin: byRule, user: user.id, ackAfterSeconds: 60 },
      { channel: 'in_app', status: 'delivered', origin: byRule, user: user.id, ackAfterSeconds: 180 },
      { channel: 'in_app', status: 'delivered', origin: byRule, user: user.id },
      { channel: 'email', status: 'sent', origin: byRule },
      { channel: 'email', status: 'sent', origin: byRule },
      { channel: 'email', status: 'dead_letter', origin: byRule },
      { channel: 'email', status: 'failed', origin: byRule },
      { channel: 'email', status: 'retrying', origin: byRule },
      { channel: 'email', status: 'pending', origin: byRule },
      { channel: 'email', status: 'digested', origin: byRule },
      { channel: 'sms', status: 'delivered', origin: { step: policy.steps[0] }, user: user.id },
      // Outside the period (the end is exclusive).
      { channel: 'email', status: 'sent', origin: byRule, createdAt: '2026-02-20T00:00:00Z' },
      { channel: 'email', status: 'sent', origin: byRule, createdAt: TO },
      // The colleague's private subscription: counted for the colleague only.
      { channel: 'in_app', status: 'delivered', origin: { subscription: subscription.id }, user: colleague, ackAfterSeconds: 30 },
    ]);
    const hook = await insertOne(a, 'webhook_subscriptions', { url: 'https://siem.example.com/hook', secret: 'report-test-secret-0123456789' });
    await insertWebhooks(orgA.id, hook.id, [
      { status: 'sent' },
      { status: 'retrying' },
      { status: 'pending' },
      { status: 'dead_letter' },
      { status: 'failed' },
      { status: 'sent', createdAt: '2026-02-20T00:00:00Z' },
    ]);
    const ruleB = await notificationRule(asOrgAdmin(other.id, orgB.id), ['blacklist_match'], ['email']);
    await insertRows(orgB.id, [{ channel: 'email', status: 'sent', origin: { rule: ruleB } }]);

    const rows = await report(a);
    expect(rows.map((r) => r.channel)).toEqual(['email', 'in_app', 'push', 'sms', 'webhook']);
    expect(rows.every((r) => r.organization_id === orgA.id)).toBe(true);
    const by = Object.fromEntries(rows.map((r) => [r.channel, r]));
    expect(by.in_app).toEqual({
      ...zero,
      organization_id: orgA.id,
      channel: 'in_app',
      total: 3,
      delivered: 3,
      acknowledged: 2,
      ack_rate: 0.6667,
      avg_response_seconds: 120,
    });
    // Digest items are not counted in total (their combined delivery is); the digested column shows them.
    expect(by.email).toEqual({
      ...zero,
      organization_id: orgA.id,
      channel: 'email',
      total: 6,
      pending: 2,
      sent: 2,
      failed: 1,
      dead_letter: 1,
      digested: 1,
      ack_rate: null,
      avg_response_seconds: null,
    });
    expect(by.sms).toMatchObject({ total: 1, delivered: 1, escalations: 1, ack_rate: null });
    // The webhook channel counts the webhook deliveries of the period.
    expect(by.webhook).toEqual({
      ...zero,
      organization_id: orgA.id,
      channel: 'webhook',
      total: 5,
      pending: 2,
      sent: 1,
      failed: 1,
      dead_letter: 1,
      ack_rate: null,
      avg_response_seconds: null,
    });
    expect(by.push).toEqual({ ...zero, organization_id: orgA.id, channel: 'push', ack_rate: null, avg_response_seconds: null });

    const mine = Object.fromEntries((await report(asOrgAdmin(colleague, orgA.id))).map((r) => [r.channel, r]));
    expect(mine.in_app).toMatchObject({ total: 4, delivered: 4, acknowledged: 3, ack_rate: 0.75, avg_response_seconds: 90 });

    const otherOrg = Object.fromEntries((await report(asOrgAdmin(other.id, orgB.id))).map((r) => [r.channel, r]));
    expect(otherOrg.email).toMatchObject({ organization_id: orgB.id, total: 1, sent: 1 });
    expect(otherOrg.in_app.total).toBe(0);
    expect(otherOrg.webhook.total).toBe(0);
  });

  it('should reject an empty or reversed period', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const error = await expectError(report(a, TO, FROM));
    expect(error.message).toContain('report_period_invalid');
    await expect(report(a, FROM, FROM)).rejects.toThrow(/report_period_invalid/);
  });

  it('should hide the root field of the result row type', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    await expectDenied(a.request(`query { delivery_report_rows { channel } }`), 'delivery_report_rows');
  });
});
