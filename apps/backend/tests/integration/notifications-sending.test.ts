import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { requireBackend } from './support/backend.js';
import { notificationRule, notificationWorld, orgDeliveries, recipientGroup, unknownArrival } from './support/notifications.js';
import {
  cronPayload,
  deliveryRow,
  insertDelivery,
  insertPayload,
  attemptFinished,
  BACKOFF_SECONDS,
  postTrigger,
  secondsBetween,
  waitFor,
  type SendRow,
} from './support/sending.js';
import { runSql } from './support/sql.js';

const sendDelivery = (id: string, deliveryId?: string) =>
  postTrigger('send_delivery', insertPayload('send_delivery', 'notification_deliveries', id, deliveryId));
const settled = (row: SendRow | null) => row !== null && !['pending'].includes(row.status);

describe('send_delivery: stubbed channels', () => {
  beforeAll(requireBackend);

  it('should send email (log only) and deliver sms/push stubs; in_app is left alone', async () => {
    const w = await notificationWorld();
    const group = await recipientGroup(w.a, [
      { user_id: w.bob, channel: 'email' },
      { external_address: '+15550100', channel: 'sms' },
      { user_id: w.bob, channel: 'push' },
      { user_id: w.bob, channel: 'in_app' },
    ]);
    await notificationRule(w.a, ['detection_unknown'], ['email', 'sms', 'push', 'in_app'], { recipient_group_id: group });
    await unknownArrival(w);
    const rows = await orgDeliveries(w.orgA.id);
    const byChannel = async (channel: string) => {
      const id = rows.find((r) => r.channel === channel)?.id ?? '';
      return waitFor(() => deliveryRow(id), settled);
    };
    const email = await byChannel('email');
    expect(email).toMatchObject({ status: 'sent', attempts: 1, error: null });
    expect(email.sent_at).not.toBeNull();
    for (const channel of ['sms', 'push']) {
      const row = await waitFor(() => byChannel(channel), (r) => r.status === 'delivered');
      expect(row).toMatchObject({ attempts: 1 });
      expect(row.delivered_at).not.toBeNull();
    }
    const inApp = rows.find((r) => r.channel === 'in_app');
    const res = await sendDelivery(inApp?.id ?? '');
    expect(res.status).toBe(200);
    expect(await deliveryRow(inApp?.id ?? '')).toMatchObject({ status: 'delivered', attempts: 0 });
  });

  it('should not send deferred (deliver_after in the future) or digest rows', async () => {
    const w = await notificationWorld();
    const rule = await notificationRule(w.a, ['detection_unknown'], ['email']);
    const future = new Date(Date.now() + 3600_000).toISOString();
    const deferred = await insertDelivery(w.orgA.id, rule, { channel: 'email', address: 'later@example.com', deliverAfter: future });
    const digest = await insertDelivery(w.orgA.id, rule, {
      channel: 'email', address: 'digest@example.com', deliverAfter: new Date(Date.now() - 1000).toISOString(),
      content: { subject: 'x', body: 'y', title: 'x', digest: 'hourly' },
    });
    const now = await insertDelivery(w.orgA.id, rule, { channel: 'email', address: 'now@example.com' });
    await waitFor(() => deliveryRow(now), settled);
    for (const id of [deferred, digest]) {
      expect((await sendDelivery(id)).status).toBe(200);
      expect(await deliveryRow(id)).toMatchObject({ status: 'pending', attempts: 0, sent_at: null });
    }
  });

  it('should send once when the trigger is redelivered or races; a vanished row is a no-op', async () => {
    const w = await notificationWorld();
    const rule = await notificationRule(w.a, ['detection_unknown'], ['sms']);
    const id = await insertDelivery(w.orgA.id, rule, { channel: 'sms', address: '+15550101' });
    const hasuraId = randomUUID();
    await Promise.all([sendDelivery(id, hasuraId), sendDelivery(id, hasuraId), sendDelivery(id)]);
    const row = await waitFor(() => deliveryRow(id), (r) => r?.status === 'delivered');
    await sendDelivery(id, hasuraId);
    expect(await deliveryRow(id)).toMatchObject({ status: 'delivered', attempts: 1 });
    expect(row?.attempts).toBe(1);
    const gone = await sendDelivery(randomUUID());
    expect(gone).toMatchObject({ status: 200, body: { ok: true, skipped: 'not_claimed' } });
  });

  it('should retry a failing delivery with backoff and dead-letter it after 5 attempts', async () => {
    const w = await notificationWorld();
    const rule = await notificationRule(w.a, ['detection_unknown'], ['email']);
    // The stub rejects the reserved .invalid domain (RFC 2606).
    const id = await insertDelivery(w.orgA.id, rule, { channel: 'email', address: 'nobody@bounce.invalid' });
    const finished = (r: SendRow | null) => r !== null && r.attempts >= 1 && attemptFinished(r.status, r.attempts, r.deliver_after);
    let row = await waitFor(() => deliveryRow(id), finished);
    // The real retry_deliveries cron may take some attempts itself: assert counts and windows, not who sent.
    for (let round = 0; row.status !== 'dead_letter' && round < 10; round++) {
      expect(row.status).toBe('retrying');
      expect(row.error).toMatch(/invalid/);
      const wait = secondsBetween(new Date().toISOString(), row.deliver_after ?? '');
      expect(wait).toBeGreaterThan(BACKOFF_SECONDS[row.attempts - 1] - 15);
      expect(wait).toBeLessThanOrEqual(BACKOFF_SECONDS[row.attempts - 1]);
      const before = row.attempts;
      await runSql(`update itap.notification_deliveries set deliver_after = now() - interval '1 second' where id = '${id}'`);
      expect((await postTrigger('retry_deliveries', cronPayload('retry_deliveries'))).status).toBe(200);
      row = await waitFor(() => deliveryRow(id), (r) => finished(r) && (r?.attempts ?? 0) > before);
    }
    expect(row).toMatchObject({ status: 'dead_letter', attempts: 5 });
    // A dead letter is never claimed again.
    expect((await postTrigger('retry_deliveries', cronPayload('retry_deliveries'))).status).toBe(200);
    expect(await deliveryRow(id)).toMatchObject({ status: 'dead_letter', attempts: 5 });
  });
});

describe('send_delivery: recovery by the retry_deliveries cron', () => {
  beforeAll(requireBackend);

  it('should re-send a claimed delivery whose result was lost once its lease expires', async () => {
    const w = await notificationWorld();
    const rule = await notificationRule(w.a, ['detection_unknown'], ['sms']);
    const future = new Date(Date.now() + 3600_000).toISOString();
    const id = await insertDelivery(w.orgA.id, rule, { channel: 'sms', address: '+15550102', deliverAfter: future });
    // Claim without finishing (a crashed handler): one transaction, so no cron can claim it in between.
    await runSql(`update itap.notification_deliveries set deliver_after = now() - interval '1 second' where id = '${id}';
      select id from itap.claim_notification_delivery('${id}')`);
    const claimed = await deliveryRow(id);
    expect(claimed).toMatchObject({ status: 'pending', attempts: 1 });
    expect(secondsBetween(new Date().toISOString(), claimed?.deliver_after ?? '')).toBeGreaterThan(45);
    // Not due while the lease holds.
    expect((await postTrigger('retry_deliveries', cronPayload('retry_deliveries'))).status).toBe(200);
    expect(await deliveryRow(id)).toMatchObject({ status: 'pending', attempts: 1 });
    await runSql(`update itap.notification_deliveries set deliver_after = now() - interval '1 second' where id = '${id}'`);
    expect((await postTrigger('retry_deliveries', cronPayload('retry_deliveries'))).status).toBe(200);
    const row = await waitFor(() => deliveryRow(id), (r) => r?.status === 'delivered');
    expect(row).toMatchObject({ attempts: 2, error: null });
    expect(row.sent_at).not.toBeNull();
    expect(row.delivered_at).not.toBeNull();
  });

  it('should send a pending row whose trigger never fired', async () => {
    const w = await notificationWorld();
    const rule = await notificationRule(w.a, ['detection_unknown'], ['email']);
    const createdAt = new Date(Date.now() - 180_000).toISOString();
    const id = await insertDelivery(w.orgA.id, rule, { channel: 'email', address: 'lost@example.com', createdAt, silent: true });
    expect(await deliveryRow(id)).toMatchObject({ status: 'pending', attempts: 0 });
    expect((await postTrigger('retry_deliveries', cronPayload('retry_deliveries'))).status).toBe(200);
    expect(await waitFor(() => deliveryRow(id), (r) => r?.status === 'sent')).toMatchObject({ attempts: 1 });
  });

  it('should release a quiet-hours row after deliver_after and keep its scheduled time', async () => {
    const w = await notificationWorld();
    const rule = await notificationRule(w.a, ['detection_unknown'], ['push']);
    const scheduled = new Date(Date.now() + 2000).toISOString();
    const id = await insertDelivery(w.orgA.id, rule, { channel: 'push', address: 'device-token-1', deliverAfter: scheduled });
    expect((await postTrigger('retry_deliveries', cronPayload('retry_deliveries'))).status).toBe(200);
    expect(await deliveryRow(id)).toMatchObject({ status: 'pending', attempts: 0 });
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect((await postTrigger('retry_deliveries', cronPayload('retry_deliveries'))).status).toBe(200);
    const row = await waitFor(() => deliveryRow(id), (r) => r?.status === 'delivered');
    expect(row.attempts).toBe(1);
    expect(Date.parse(row.deliver_after ?? '')).toBe(Date.parse(scheduled));
    expect(Date.parse(String(row.content.scheduled_for))).toBe(Date.parse(scheduled));
  });
});
