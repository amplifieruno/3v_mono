import { beforeAll, describe, expect, it } from 'vitest';
import { requireBackend } from './support/backend.js';
import { asAdmin } from './support/clients.js';
import { ruleDeliveries, sendDigests, type DigestDelivery } from './support/escalation.js';
import { fanOutAgain, notificationRule, notificationWorld, recipientGroup, unknownArrival } from './support/notifications.js';
import { cronPayload, deliveryRow, insertDelivery, postTrigger, waitFor } from './support/sending.js';
import { runSql } from './support/sql.js';
import { at, createIdentity } from './support/tracking.js';

const iso = (ts: string | null | undefined): string | null => (ts ? new Date(ts).toISOString() : null);
const setTimezone = (orgId: string, timezone: string) =>
  asAdmin().request(`mutation($id: uuid!, $tz: String!) { update_organizations_by_pk(pk_columns: {id: $id}, _set: {timezone: $tz}) { id } }`, {
    id: orgId,
    tz: timezone,
  });
const byRecipient = (rows: DigestDelivery[], recipient: string) =>
  rows.filter((d) => (d.recipient_user_id ?? d.recipient_address) === recipient);

describe('send_digests', () => {
  it('should combine due digest items per rule, recipient, channel and window into one delivery', async () => {
    const w = await notificationWorld();
    const group = await recipientGroup(w.a, [
      { user_id: w.bob, channel: 'email' },
      { user_id: w.bob, channel: 'in_app' },
      { external_address: 'digest@example.com', channel: 'email' },
    ]);
    const rule = await notificationRule(w.a, ['detection_unknown'], ['email', 'in_app'], {
      recipient_group_id: group,
      digest_mode: 'hourly',
      priority: 'high',
    });
    // 08:00 and 08:10 -> window 08:00-09:00; 09:06:40 -> window 09:00-10:00.
    const e1 = await unknownArrival(w, 0);
    const e2 = await unknownArrival(w, 600, await createIdentity(w.a));
    const e3 = await unknownArrival(w, 4000, await createIdentity(w.a));
    let rows = await ruleDeliveries(w.orgA.id, rule);
    expect(rows.filter((d) => d.channel === 'in_app').every((d) => d.status === 'delivered')).toBe(true);
    const items = rows.filter((d) => d.channel === 'email');
    expect(items).toHaveLength(6);
    expect(items.every((d) => d.status === 'pending' && d.content.digest === 'hourly')).toBe(true);

    expect(await sendDigests(w.orgA.id, at(3599))).toEqual([]);
    const first = await sendDigests(w.orgA.id, at(3600));
    expect(first).toHaveLength(2);
    expect(await sendDigests(w.orgA.id, at(3600))).toEqual([]);

    rows = await ruleDeliveries(w.orgA.id, rule);
    const combined = rows.filter((d) => d.event_id === null);
    expect(combined.map((d) => d.id).sort()).toEqual(first.map((d) => d.id).sort());
    for (const recipient of [w.bob, 'digest@example.com']) {
      const [digest] = byRecipient(combined, recipient);
      expect(digest).toMatchObject({ rule_id: rule, channel: 'email', priority: 'high', digested_into: null });
      expect(digest.content).not.toHaveProperty('digest');
      expect(digest.content).toMatchObject({ digest_period: 'hourly', item_count: 2 });
      expect(iso(digest.content.window_start as string)).toBe(at(0));
      expect(iso(digest.content.window_end as string)).toBe(at(3600));
      expect((digest.content.items as { event_id: string }[]).map((x) => x.event_id)).toEqual([e1.id, e2.id]);
      expect(String(digest.content.body)).toContain(e1.title);
      const mine = byRecipient(rows, recipient).filter((d) => d.channel === 'email' && d.event_id !== null);
      expect(mine.map((d) => [d.event_id, d.status, d.digested_into])).toEqual([
        [e1.id, 'digested', digest.id],
        [e2.id, 'digested', digest.id],
        [e3.id, 'pending', null],
      ]);
      // Combined deliveries go through normal sending (email stub -> sent).
      await waitFor(() => deliveryRow(digest.id), (r) => r?.status === 'sent');
    }

    const second = await sendDigests(w.orgA.id, at(7200));
    expect(second).toHaveLength(2);
    rows = await ruleDeliveries(w.orgA.id, rule);
    expect(rows.filter((d) => d.event_id !== null && d.status === 'pending')).toEqual([]);
    const late = rows.find((d) => d.id === second[0].id);
    expect(late?.content).toMatchObject({ item_count: 1 });
    expect(iso(late?.content.window_start as string)).toBe(at(3600));
  });

  it('should use UTC hours for hourly windows and the organization day for daily windows', async () => {
    const w = await notificationWorld();
    const event = await unknownArrival(w, 600); // 08:10 UTC
    const group = await recipientGroup(w.a, [{ user_id: w.bob, channel: 'email' }]);
    const hourly = await notificationRule(w.a, ['detection_unknown'], ['email'], { recipient_group_id: group, digest_mode: 'hourly' });
    const daily = await notificationRule(w.a, ['detection_unknown'], ['email'], { recipient_group_id: group, digest_mode: 'daily' });
    // Organization in Tokyo (UTC+9): 08:10 UTC = 17:10 local; the day ends at 15:00 UTC. A writer session in a
    // half-hour timezone must not move the hourly boundary.
    await setTimezone(w.orgA.id, 'Asia/Tokyo');
    await runSql(`SET LOCAL TIME ZONE 'Asia/Kolkata'; select itap.fan_out_events('${w.orgA.id}', array['${event.id}'::uuid])`);
    const [h] = await ruleDeliveries(w.orgA.id, hourly);
    const [d] = await ruleDeliveries(w.orgA.id, daily);
    expect(iso(h.deliver_after)).toBe(at(3600));
    expect(iso(d.deliver_after)).toBe('2026-01-05T15:00:00.000Z');

    await sendDigests(w.orgA.id, at(3600));
    const [, hourlyDigest] = await ruleDeliveries(w.orgA.id, hourly);
    expect(iso(hourlyDigest.content.window_start as string)).toBe(at(0));
    expect((await ruleDeliveries(w.orgA.id, daily)).map((x) => x.status)).toEqual(['pending']);
    await sendDigests(w.orgA.id, '2026-01-05T15:00:00Z');
    const [, dailyDigest] = await ruleDeliveries(w.orgA.id, daily);
    expect(dailyDigest.content).toMatchObject({ digest_period: 'daily', item_count: 1 });
    expect(iso(dailyDigest.content.window_start as string)).toBe('2026-01-04T15:00:00.000Z');
    expect(iso(dailyDigest.content.window_end as string)).toBe('2026-01-05T15:00:00.000Z');
    // Redelivered event: no new item.
    await fanOutAgain(w.orgA.id, [event.id]);
    expect(await ruleDeliveries(w.orgA.id, daily)).toHaveLength(2);
  });

  it('should keep digested items terminal and linked', async () => {
    const w = await notificationWorld();
    const group = await recipientGroup(w.a, [{ user_id: w.bob, channel: 'email' }]);
    const rule = await notificationRule(w.a, ['detection_unknown'], ['email'], { recipient_group_id: group, digest_mode: 'hourly' });
    await unknownArrival(w);
    const [digest] = await sendDigests(w.orgA.id, at(3600));
    const [item] = (await ruleDeliveries(w.orgA.id, rule)).filter((d) => d.event_id !== null);
    const sql = (set: string) => runSql(`update itap.notification_deliveries set ${set} where id = '${item.id}'`);
    await expect(sql(`status = 'pending'`)).rejects.toThrow(/notification_delivery_invalid_transition/);
    await expect(sql(`digested_into = '${item.id}'`)).rejects.toThrow(/notification_delivery_immutable/);
    await expect(sql(`digested_into = NULL`)).rejects.toThrow(/notification_delivery_immutable/);
    expect(item.digested_into).toBe(digest.id);
  });
});

describe('digest rows on the cron path', () => {
  beforeAll(requireBackend);

  it('should leave past-due digest items to send_digests, never retry_deliveries', async () => {
    const w = await notificationWorld();
    const rule = await notificationRule(w.a, ['detection_unknown'], ['email']);
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const item = await insertDelivery(w.orgA.id, rule, {
      channel: 'email',
      address: 'digest-cron@example.com',
      deliverAfter: hourAgo,
      createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
      content: { subject: 'S', body: 'B', title: 'Item', digest: 'hourly' },
      silent: true,
    });
    expect((await postTrigger('retry_deliveries', cronPayload('retry_deliveries'))).status).toBe(200);
    expect(await deliveryRow(item)).toMatchObject({ status: 'pending', attempts: 0 });

    expect((await postTrigger('send_digests', cronPayload('send_digests'))).status).toBe(200);
    const [row] = (await ruleDeliveries(w.orgA.id, rule)).filter((d) => d.id === item);
    expect(row).toMatchObject({ status: 'digested' });
    const combined = await waitFor(() => deliveryRow(row.digested_into ?? ''), (r) => r?.status === 'sent');
    expect(combined?.content).toMatchObject({ item_count: 1 });
    expect(combined?.content).not.toHaveProperty('digest');
  });
});
