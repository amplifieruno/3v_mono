import { beforeAll, describe, expect, it } from 'vitest';
import { requireBackend } from './support/backend.js';
import { asAdmin } from './support/clients.js';
import { expectDenied, expectError } from './support/fixtures.js';
import { fanOutAgain, notificationWorld, unknownArrival } from './support/notifications.js';
import { insertOne, updateByPk } from './support/operations.js';
import {
  cronPayload,
  hmac,
  insertPayload,
  postTrigger,
  secondsBetween,
  SINK_URL,
  sinkFor,
  sinkRequests,
  waitFor,
  webhookDeliveries,
  webhookRow,
} from './support/sending.js';
import { runSql } from './support/sql.js';
import type { HasuraClient } from '../../src/hasura/client.js';

const SECRET = 'whsec-test-0123456789abcdef';

async function subscription(a: HasuraClient, url: string, eventTypes: string[], fields: Record<string, unknown> = {}) {
  return insertOne(a, 'webhook_subscriptions', {
    url,
    secret: SECRET,
    description: 'Test hook',
    webhook_subscription_event_types: { data: eventTypes.map((event_type) => ({ event_type })) },
    ...fields,
  });
}

describe('webhook subscriptions', () => {
  beforeAll(requireBackend);

  it('should keep the secret write-only and validate the url', async () => {
    const w = await notificationWorld();
    const sub = await subscription(w.a, `${SINK_URL}`, ['detection_unknown']);
    await expectDenied(
      w.a.request(`query($id: uuid!) { webhook_subscriptions_by_pk(id: $id) { secret } }`, { id: sub.id }),
      'secret',
    );
    const row = await w.a.request<{ webhook_subscriptions_by_pk: Record<string, unknown> }>(
      `query($id: uuid!) { webhook_subscriptions_by_pk(id: $id) { url is_active last_delivery_status } }`,
      { id: sub.id },
    );
    expect(row.webhook_subscriptions_by_pk).toEqual({ url: SINK_URL, is_active: true, last_delivery_status: null });
    for (const url of ['ftp://example.com/hook', 'http://169.254.169.254/latest/meta-data', 'https://user:pw@example.com/x', 'not a url']) {
      await expectError(subscription(w.a, url, ['detection_unknown']));
    }
    await expectError(subscription(w.a, 'https://example.com/hook', [], { secret: 'short' }));
    await expectDenied(updateByPk(w.a, 'webhook_subscriptions', sub.id, { last_delivery_status: 'sent' }), 'last_delivery_status');
  });

  it('should fan out matching events to active subscriptions once', async () => {
    const w = await notificationWorld();
    const match = await subscription(w.a, `${SINK_URL}/204`, ['detection_unknown']);
    await subscription(w.a, `${SINK_URL}/204`, ['blacklist_match']);
    await subscription(w.a, `${SINK_URL}/204`, ['detection_unknown'], { is_active: false });
    const event = await unknownArrival(w);
    await fanOutAgain(w.orgA.id, [event.id]);
    const rows = await webhookDeliveries(w.orgA.id);
    expect(rows.map((r) => [r.subscription_id, r.event_id])).toEqual([[match.id, event.id]]);
    expect(rows[0].body).toMatchObject({
      event_id: event.id, event_type: 'detection_unknown', organization_id: w.orgA.id, title: event.title,
      facility_id: w.facility.id, identity_id: w.identity,
    });
    expect((await webhookDeliveries(w.orgB.id))).toEqual([]);
  });
});

describe('send_webhook', () => {
  beforeAll(requireBackend);

  it('should POST the signed body; the signature verifies with the subscription secret', async () => {
    const w = await notificationWorld();
    const sub = await subscription(w.a, SINK_URL, ['detection_unknown']);
    const event = await unknownArrival(w);
    const [pending] = await webhookDeliveries(w.orgA.id);
    const row = await waitFor(() => webhookRow(pending.id), (r) => r?.status === 'sent');
    expect(row).toMatchObject({ attempts: 1, response_code: 200, error: null, next_attempt_at: null });
    const [received] = await sinkFor(row?.id ?? '');
    expect(received.headers).toMatchObject({
      'content-type': 'application/json', 'x-itap-event': 'detection_unknown', 'x-itap-delivery': row?.id,
    });
    expect(received.headers['x-itap-signature']).toBe(hmac(SECRET, received.body));
    expect(received.headers['x-itap-signature']).toBe(row?.signature);
    expect(received.headers['x-itap-signature']).not.toBe(hmac('wrong-secret', received.body));
    const body = JSON.parse(received.body) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'area_id', 'event_id', 'event_type', 'facility_id', 'identity_id', 'occurred_at', 'organization_id', 'payload',
      'profile_id', 'severity', 'title',
    ]);
    expect(body).toMatchObject({ event_id: event.id, severity: event.severity });
    const status = await asAdmin().request<{ webhook_subscriptions_by_pk: { last_delivery_status: string } }>(
      `query($id: uuid!) { webhook_subscriptions_by_pk(id: $id) { last_delivery_status } }`,
      { id: sub.id },
    );
    expect(status.webhook_subscriptions_by_pk.last_delivery_status).toBe('sent');
    // Redelivery of the trigger sends nothing more.
    await postTrigger('send_webhook', insertPayload('send_webhook', 'webhook_deliveries', row?.id ?? ''));
    expect(await sinkFor(row?.id ?? '')).toHaveLength(1);
    expect(await webhookRow(row?.id ?? '')).toMatchObject({ status: 'sent', attempts: 1 });
  });

  it('should retry a 500 with backoff and end in dead_letter after 5 attempts (Review Focus 4)', async () => {
    const w = await notificationWorld();
    await subscription(w.a, `${SINK_URL}/500`, ['detection_unknown']);
    await unknownArrival(w);
    const [first] = await webhookDeliveries(w.orgA.id);
    const backoff = [30, 120, 600, 1800];
    for (let attempt = 1; attempt <= 5; attempt++) {
      if (attempt > 1) {
        await runSql(`update itap.webhook_deliveries set next_attempt_at = now() - interval '1 second' where id = '${first.id}'`);
        expect((await postTrigger('retry_webhooks', cronPayload('retry_webhooks'))).status).toBe(200);
      }
      const row = await waitFor(
        () => webhookRow(first.id),
        (r) => (r?.attempts ?? 0) >= attempt && r?.response_code === 500 && ['retrying', 'dead_letter'].includes(r?.status ?? ''),
      );
      expect(row?.attempts).toBe(attempt);
      if (attempt < 5) {
        expect(row?.status).toBe('retrying');
        const wait = secondsBetween(new Date().toISOString(), row?.next_attempt_at ?? '');
        expect(wait).toBeGreaterThan(backoff[attempt - 1] - 15);
        expect(wait).toBeLessThanOrEqual(backoff[attempt - 1]);
      } else {
        expect(row).toMatchObject({ status: 'dead_letter', next_attempt_at: null });
      }
    }
    const received = await sinkFor(first.id);
    expect(received).toHaveLength(5);
    expect(new Set(received.map((r) => r.headers['x-itap-signature'])).size).toBe(1);
    expect(received[0].headers['x-itap-signature']).toBe(hmac(SECRET, received[0].body));
  });

  it('should not send for a subscription deactivated after fan-out', async () => {
    const w = await notificationWorld();
    const sub = await subscription(w.a, SINK_URL, ['detection_unknown']);
    await runSql(`alter table itap.webhook_deliveries disable trigger user`);
    let id = '';
    try {
      await unknownArrival(w);
      id = (await webhookDeliveries(w.orgA.id))[0]?.id ?? '';
    } finally {
      await runSql(`alter table itap.webhook_deliveries enable trigger user`);
    }
    expect(id).not.toBe('');
    await updateByPk(w.a, 'webhook_subscriptions', sub.id, { is_active: false });
    await postTrigger('send_webhook', insertPayload('send_webhook', 'webhook_deliveries', id));
    expect(await webhookRow(id)).toMatchObject({ status: 'failed', error: 'subscription_inactive' });
    expect(await sinkFor(id)).toEqual([]);
  });
});

describe('webhook sink (dev only)', () => {
  beforeAll(requireBackend);

  it('should list received requests only with the secret header', async () => {
    expect((await sinkRequests(null)).status).toBe(401);
    expect((await sinkRequests('wrong')).status).toBe(401);
    const res = await fetch(`http://localhost:${process.env.BACKEND_PORT ?? 3001}/hasura/events/webhook-sink/418`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-itap-delivery': 'sink-probe' }, body: '{"a":1}',
    });
    expect(res.status).toBe(418);
    const [probe] = await sinkFor('sink-probe');
    expect(probe).toMatchObject({ status: 418, body: '{"a":1}' });
  });
});
