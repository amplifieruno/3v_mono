import { describe, expect, it } from 'vitest';
import { member, notificationRule, notificationWorld, orgDeliveries, recipientGroup, setMember, unknownArrival } from './support/notifications.js';
import { runSqlRows } from './support/sql.js';
import { at } from './support/tracking.js';

/** The shared recipient resolution (itap.notification_recipient) used by Stage C and escalation. */
async function resolve(orgId: string, user: string, ts: string, delegate = true): Promise<string | null> {
  const [row] = await runSqlRows(`select itap.notification_recipient('${orgId}', '${user}', '${ts}'::timestamptz, ${delegate}) as u`);
  return row?.u === 'NULL' ? null : (row?.u ?? null);
}

describe('notification recipient resolution', () => {
  it('should keep the member on vacation when the delegate is deactivated, suspended or expired', async () => {
    const w = await notificationWorld();
    const [away, gone, paused, expired] = await Promise.all([member(w.orgA.id), member(w.orgA.id), member(w.orgA.id), member(w.orgA.id)]);
    await setMember(w.orgA.id, away, `vacation_until = '${at(86400)}', vacation_delegate_user_id = '${gone}'`);
    await setMember(w.orgA.id, gone, `status = 'deactivated', deactivated_at = now()`);
    expect(await resolve(w.orgA.id, away, at(0))).toBe(away);
    await setMember(w.orgA.id, away, `vacation_delegate_user_id = '${paused}'`);
    await setMember(w.orgA.id, paused, `status = 'suspended'`);
    expect(await resolve(w.orgA.id, away, at(0))).toBe(away);
    await setMember(w.orgA.id, away, `vacation_delegate_user_id = '${expired}'`);
    await setMember(w.orgA.id, expired, `expires_at = '${at(-1)}'`);
    expect(await resolve(w.orgA.id, away, at(0))).toBe(away);
    // Without delegation (subscriptions) the member is used as is; an inactive member resolves to nobody.
    expect(await resolve(w.orgA.id, away, at(0), false)).toBe(away);
    expect(await resolve(w.orgA.id, gone, at(0))).toBeNull();

    const group = await recipientGroup(w.a, [{ user_id: away, channel: 'in_app' }]);
    await notificationRule(w.a, ['detection_unknown'], ['in_app'], { recipient_group_id: group });
    await unknownArrival(w);
    expect((await orgDeliveries(w.orgA.id)).map((d) => d.recipient_user_id)).toEqual([away]);
  });

  it('should delegate one hop only when two members on vacation delegate to each other', async () => {
    const w = await notificationWorld();
    await setMember(w.orgA.id, w.bob, `vacation_until = '${at(86400)}', vacation_delegate_user_id = '${w.carol}'`);
    await setMember(w.orgA.id, w.carol, `vacation_until = '${at(86400)}', vacation_delegate_user_id = '${w.bob}'`);
    expect(await resolve(w.orgA.id, w.bob, at(0))).toBe(w.carol);
    expect(await resolve(w.orgA.id, w.carol, at(0))).toBe(w.bob);
    const group = await recipientGroup(w.a, [{ user_id: w.bob, channel: 'in_app' }, { user_id: w.carol, channel: 'in_app' }]);
    await notificationRule(w.a, ['detection_unknown'], ['in_app'], { recipient_group_id: group });
    await unknownArrival(w);
    expect((await orgDeliveries(w.orgA.id)).map((d) => d.recipient_user_id).sort()).toEqual([w.bob, w.carol].sort());
  });
});
