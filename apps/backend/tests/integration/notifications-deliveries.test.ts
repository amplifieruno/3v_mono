import { describe, expect, it } from 'vitest';
import {
  notificationRule,
  notificationWorld,
  orgDeliveries,
  recipientGroup,
  unknownArrival,
} from './support/notifications.js';
import { runSql, runSqlRows } from './support/sql.js';

const end = async (windows: unknown, tz: string, ts: string): Promise<string | null> => {
  const [row] = await runSqlRows(
    `select itap.windows_end('${JSON.stringify(windows)}', '${tz}', '${ts}') at time zone 'UTC' as e`,
  );
  return row.e === 'NULL' ? null : row.e;
};

describe('quiet-hours window end', () => {
  it('should return the instant itself outside the windows and the window end inside them', async () => {
    const day = [{ days: [1], from: '07:00', to: '09:00' }];
    expect(await end(day, 'UTC', '2026-01-05T10:00:00Z')).toBe('2026-01-05 10:00:00');
    expect(await end(day, 'UTC', '2026-01-05T08:00:00Z')).toBe('2026-01-05 09:00:00');
    // Overnight window that started on Sunday; adjacent windows chain; timezone applies.
    const night = [{ days: [7], from: '22:00', to: '08:30' }, { days: [1], from: '08:30', to: '10:00' }];
    expect(await end(night, 'UTC', '2026-01-05T06:00:00Z')).toBe('2026-01-05 10:00:00');
    expect(await end([{ days: [1], from: '16:00', to: '24:00' }], 'Asia/Tokyo', '2026-01-05T08:00:00Z')).toBe(
      '2026-01-05 15:00:00',
    );
    // Always quiet: no end, the caller does not defer.
    expect(await end([{ days: [1, 2, 3, 4, 5, 6, 7], from: '00:00', to: '24:00' }], 'UTC', '2026-01-05T08:00:00Z')).toBeNull();
  });
});

describe('notification deliveries', () => {
  it('should allow only sending-state changes along the status machine and one acknowledgement', async () => {
    const w = await notificationWorld();
    const group = await recipientGroup(w.a, [{ user_id: w.bob, channel: 'email' }]);
    await notificationRule(w.a, ['detection_unknown'], ['email'], { recipient_group_id: group });
    await unknownArrival(w);
    const [d] = await orgDeliveries(w.orgA.id);
    const update = (set: string) => runSql(`update itap.notification_deliveries set ${set} where id = '${d.id}'`);
    await update(`status = 'retrying', attempts = 1, error = 'timeout'`);
    await update(`status = 'sent', sent_at = now()`);
    await update(`status = 'delivered', delivered_at = now()`);
    await expect(update(`status = 'pending'`)).rejects.toThrow(/notification_delivery_invalid_transition/);
    await expect(update(`content = '{}'`)).rejects.toThrow(/notification_delivery_immutable/);
    await expect(update(`recipient_user_id = '${w.carol}'`)).rejects.toThrow(/notification_delivery_immutable/);
    await update(`acknowledged_at = now()`);
    await expect(update(`acknowledged_at = now() + interval '1 minute'`)).rejects.toThrow(/notification_delivery_already_acknowledged/);
  });

  it('should require exactly one origin and one recipient', async () => {
    const w = await notificationWorld();
    const insert = (cols: string, vals: string) =>
      runSql(`insert into itap.notification_deliveries (organization_id, channel, ${cols}) values ('${w.orgA.id}', 'email', ${vals})`);
    await expect(insert('recipient_address', `'x@example.com'`)).rejects.toThrow(/notification_deliveries_exactly_one_origin/);
    await expect(insert('report_id', `gen_random_uuid()`)).rejects.toThrow(/notification_deliveries_exactly_one_recipient/);
    await expect(insert('report_id, recipient_address, recipient_user_id', `gen_random_uuid(), 'x@example.com', '${w.bob}'`)).rejects.toThrow(
      /notification_deliveries_exactly_one_recipient/,
    );
    await insert('report_id, recipient_address', `gen_random_uuid(), 'x@example.com'`);
  });

  it('should defer non-in_app deliveries of digest rules to the end of the digest period', async () => {
    const w = await notificationWorld();
    const group = await recipientGroup(w.a, [
      { user_id: w.bob, channel: 'email' },
      { user_id: w.bob, channel: 'in_app' },
    ]);
    await notificationRule(w.a, ['detection_unknown'], ['email', 'in_app'], { recipient_group_id: group, digest_mode: 'hourly' });
    await unknownArrival(w, 600);
    const rows = await orgDeliveries(w.orgA.id);
    const email = rows.find((d) => d.channel === 'email');
    expect(Date.parse(email?.deliver_after ?? '')).toBe(Date.parse('2026-01-05T09:00:00Z'));
    expect(email?.content).toMatchObject({ digest: 'hourly' });
    expect(rows.find((d) => d.channel === 'in_app')).toMatchObject({ status: 'delivered', deliver_after: null });
  });
});
