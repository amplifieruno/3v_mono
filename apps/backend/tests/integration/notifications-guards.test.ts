import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { escalate, escalationIncident, escalationPolicy, minutes } from './support/escalation.js';
import { expectError } from './support/fixtures.js';
import { member, notificationRule, notificationWorld, recipientGroup, setMember } from './support/notifications.js';
import { callFn, INCIDENT_FIELDS, insertOne, updateByPk } from './support/operations.js';
import { runSqlRows } from './support/sql.js';

/** Slice 5 final review: claim dead-letter reasons, incident audit noise, channel and repeat constraints. */

/**
 * Inserts a delivery to a member (triggers off in this transaction: no send_delivery event) and claims it at once,
 * so no live retry_deliveries run can claim it first. Returns the claimed attempts ([] = not claimed) and the row.
 */
async function insertAndClaim(orgId: string, ruleId: string, userId: string, fields: { status?: string; attempts?: number } = {}) {
  const id = randomUUID();
  const scheduled = new Date(Date.now() - 60_000).toISOString();
  const claimed = await runSqlRows(`SET LOCAL session_replication_role = replica;
    insert into itap.notification_deliveries
      (id, organization_id, rule_id, event_id, recipient_user_id, channel, status, attempts, deliver_after, content)
    values ('${id}', '${orgId}', '${ruleId}', '${randomUUID()}', '${userId}', 'email', '${fields.status ?? 'pending'}',
            ${fields.attempts ?? 0}, '${scheduled}', '{"subject":"S","body":"B","title":"T"}'::jsonb);
    select attempts::text from itap.claim_notification_delivery('${id}')`);
  const [row] = await runSqlRows(`select status, error, attempts::text, deliver_after from itap.notification_deliveries where id = '${id}'`);
  return { claimed, row, scheduled };
}

describe('claim_notification_delivery: dead-letter reasons', () => {
  it('should dead-letter a deferred delivery whose recipient is no longer an active, unexpired member', async () => {
    const w = await notificationWorld();
    const rule = await notificationRule(w.a, ['detection_unknown'], ['email']);
    const [gone, expired] = await Promise.all([member(w.orgA.id), member(w.orgA.id)]);
    await setMember(w.orgA.id, gone, `status = 'deactivated', deactivated_at = now()`);
    await setMember(w.orgA.id, expired, `expires_at = now() - interval '1 minute'`);
    for (const user of [gone, expired]) {
      const { claimed, row, scheduled } = await insertAndClaim(w.orgA.id, rule, user);
      expect(claimed).toEqual([]);
      expect(row).toMatchObject({ status: 'dead_letter', error: 'recipient_inactive', attempts: '0' });
      // The scheduled time is kept.
      expect(Date.parse(row.deliver_after ?? '')).toBe(Date.parse(scheduled));
    }
    // An active recipient is claimed as before.
    const active = await insertAndClaim(w.orgA.id, rule, w.bob);
    expect(active.claimed).toEqual([{ attempts: '1' }]);
    expect(active.row).toMatchObject({ status: 'pending', error: 'NULL' });
  });

  it("should record 'max_attempts' when the claim dead-letters a delivery out of attempts", async () => {
    const w = await notificationWorld();
    const rule = await notificationRule(w.a, ['detection_unknown'], ['email']);
    const { claimed, row } = await insertAndClaim(w.orgA.id, rule, w.bob, { status: 'retrying', attempts: 5 });
    expect(claimed).toEqual([]);
    expect(row).toMatchObject({ status: 'dead_letter', error: 'max_attempts', attempts: '5' });
  });
});

describe('incident audit', () => {
  it('should not audit the escalation counters written by the escalate cron, but still audit operator changes', async () => {
    const w = await notificationWorld();
    const group = await recipientGroup(w.a, [{ user_id: w.bob, channel: 'in_app' }]);
    const p = await escalationPolicy(w.a, [{ after_minutes: 1, channel: 'in_app', recipient_group_id: group }]);
    const incident = await escalationIncident(w.a, w.orgA.id, p.id);
    const audits = async () =>
      (await runSqlRows(`select changes::text from itap.audit_log where entity = 'incidents' and entity_id = '${incident}' and action = 'update'`))
        .map((r) => r.changes ?? '');
    const before = await audits();
    expect(await escalate(w.orgA.id, minutes(1))).toMatchObject([{ id: incident, escalation_step: 1 }]);
    expect(await audits()).toEqual(before);
    await callFn(w.a, 'acknowledge_incident', { p_incident: incident }, INCIDENT_FIELDS);
    const after = await audits();
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)).toContain('acknowledged');
  });
});

describe('notification constraints', () => {
  it('should reject the webhook channel on escalation steps and notification rules', async () => {
    const w = await notificationWorld();
    const group = await recipientGroup(w.a, [{ user_id: w.bob, channel: 'in_app' }]);
    const policy = await insertOne(w.a, 'escalation_policies', { name: `P ${Math.random()}` });
    const step = { policy_id: policy.id, step_no: 1, after_minutes: 0, recipient_group_id: group };
    expect((await expectError(insertOne(w.a, 'escalation_policy_steps', { ...step, channel: 'webhook' }))).message).toMatch(
      /escalation_policy_steps_channel_not_webhook/,
    );
    await insertOne(w.a, 'escalation_policy_steps', { ...step, channel: 'email' });
    const rule = await notificationRule(w.a, ['detection_unknown'], ['in_app']);
    expect((await expectError(insertOne(w.a, 'notification_rule_channels', { rule_id: rule, channel: 'webhook' }))).message).toMatch(
      /notification_rule_channels_channel_not_webhook/,
    );
  });

  it('should require max_cycles for a repeating escalation policy', async () => {
    const w = await notificationWorld();
    const unbounded = await expectError(insertOne(w.a, 'escalation_policies', { name: `P ${Math.random()}`, repeat: true }));
    expect(unbounded.message).toMatch(/escalation_policies_repeat_bounded/);
    const once = await insertOne(w.a, 'escalation_policies', { name: `P ${Math.random()}` });
    expect((await expectError(updateByPk(w.a, 'escalation_policies', once.id, { repeat: true }))).message).toMatch(
      /escalation_policies_repeat_bounded/,
    );
    const bounded = await insertOne(w.a, 'escalation_policies', { name: `P ${Math.random()}`, repeat: true, max_cycles: 2 });
    expect((await expectError(updateByPk(w.a, 'escalation_policies', bounded.id, { max_cycles: null }))).message).toMatch(
      /escalation_policies_repeat_bounded/,
    );
    await updateByPk(w.a, 'escalation_policies', bounded.id, { repeat: false, max_cycles: null });
  });
});
