import { describe, expect, it, vi } from 'vitest';
import type { HasuraClient } from '../hasura/client.js';
import { sendNotificationDelivery } from './sendDelivery.js';

type Row = { id: string; attempts: number; channel: string; recipient_address: string | null; recipient_user_id: string | null; content: Record<string, unknown> };
type Finish = { id: string; attempt: number; ok: boolean; delivered: boolean; error: string | null };

function fakeAdmin(rows: Row[]) {
  const finishes: Finish[] = [];
  const request = vi.fn(async (query: string, variables?: Record<string, unknown>) => {
    if (query.includes('ClaimNotificationDelivery')) return { claim_notification_delivery: rows };
    finishes.push(variables as Finish);
    return { finish_notification_delivery: [{ id: 'd-1', status: 'x' }] };
  });
  return { admin: { request } as unknown as HasuraClient, finishes };
}

const row = (channel: string, address: string | null, user: string | null = null): Row => ({
  id: 'd-1', attempts: 1, channel, recipient_address: address, recipient_user_id: user,
  content: { subject: 'Unknown person', body: 'Lobby', title: 'Unknown person' },
});

describe('sendNotificationDelivery (stubbed channels)', () => {
  it('should log an email and leave it sent (no delivery receipt)', async () => {
    const { admin, finishes } = fakeAdmin([row('email', 'guard@example.com')]);
    const log = vi.fn();
    await sendNotificationDelivery('d-1', { admin, log });
    expect(finishes).toEqual([{ id: 'd-1', attempt: 1, ok: true, delivered: false, error: null }]);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      msg: 'notification_sent', channel: 'email', delivery_id: 'd-1', to: 'guard@example.com', subject: 'Unknown person',
    }));
  });

  it('should mark sms, push and webhook-channel stubs delivered', async () => {
    for (const [channel, address, user] of [['sms', '+15550100', null], ['push', null, 'u-1'], ['webhook', 'https://x.test', null]] as const) {
      const { admin, finishes } = fakeAdmin([row(channel, address, user)]);
      await sendNotificationDelivery('d-1', { admin, log: vi.fn() });
      expect(finishes[0]).toMatchObject({ ok: true, delivered: true });
    }
  });

  it('should fail a delivery to a reserved .invalid address so it is retried', async () => {
    const { admin, finishes } = fakeAdmin([row('email', 'nobody@bounce.invalid')]);
    await sendNotificationDelivery('d-1', { admin, log: vi.fn() });
    expect(finishes[0]).toMatchObject({ ok: false, delivered: false, error: expect.stringMatching(/\.invalid/) });
  });

  it('should skip a row that is not claimable', async () => {
    const { admin, finishes } = fakeAdmin([]);
    expect(await sendNotificationDelivery('d-1', { admin, log: vi.fn() })).toEqual({ delivery_id: 'd-1', skipped: 'not_claimed' });
    expect(finishes).toEqual([]);
  });
});
