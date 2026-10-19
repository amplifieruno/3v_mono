import { describe, expect, it, vi } from 'vitest';
import type { HasuraClient } from '../hasura/client.js';
import { hangingFetch } from '../http/fetchStubs.js';
import { signWebhookBody } from './signature.js';
import { sendWebhookDelivery, type WebhookFetch } from './sendWebhook.js';

const SECRET = 'whsec-0123456789abcdef';
const claimed = {
  id: 'wd-1',
  attempts: 2,
  event_type: 'detection_unknown',
  body: { event_id: 'e-1', title: 'Unknown person' },
  subscription: { url: 'http://sink.test/hook', secret: SECRET },
};

type Finish = { id: string; attempt: number; ok: boolean; retryable: boolean; code: number | null; signature: string | null; error: string | null };

function fakeAdmin(claim: unknown[] = [claimed]) {
  const finishes: Finish[] = [];
  const request = vi.fn(async (query: string, variables?: Record<string, unknown>) => {
    if (query.includes('ClaimWebhookDelivery')) return { claim_webhook_delivery: claim };
    finishes.push(variables as Finish);
    return { finish_webhook_delivery: [{ id: 'wd-1', status: 'x' }] };
  });
  return { admin: { request } as unknown as HasuraClient, finishes };
}

const lookup = async () => ['93.184.216.34'];

describe('sendWebhookDelivery', () => {
  it('should POST the JSON body with event, delivery and signature headers and record a 2xx as ok', async () => {
    const { admin, finishes } = fakeAdmin();
    const calls: { url: string; init: RequestInit }[] = [];
    const fetch: WebhookFetch = async (url, init) => {
      calls.push({ url, init });
      return new Response(null, { status: 204 });
    };
    const result = await sendWebhookDelivery('wd-1', { admin, fetch, lookup });
    const body = JSON.stringify(claimed.body);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://sink.test/hook');
    expect(calls[0].init).toMatchObject({ method: 'POST', body, redirect: 'manual' });
    expect(calls[0].init.headers).toEqual({
      'content-type': 'application/json',
      'x-itap-event': 'detection_unknown',
      'x-itap-delivery': 'wd-1',
      'x-itap-signature': signWebhookBody(SECRET, body),
    });
    expect(finishes).toEqual([
      { id: 'wd-1', attempt: 2, ok: true, retryable: false, code: 204, signature: signWebhookBody(SECRET, body), error: null },
    ]);
    expect(result).toMatchObject({ delivery_id: 'wd-1', ok: true });
  });

  it('should record a non-2xx (including redirects) as a retryable failure with the response code', async () => {
    for (const status of [500, 302, 404]) {
      const { admin, finishes } = fakeAdmin();
      await sendWebhookDelivery('wd-1', { admin, fetch: async () => new Response('nope', { status }), lookup });
      expect(finishes[0]).toMatchObject({ ok: false, retryable: true, code: status, error: `HTTP ${status}` });
    }
  });

  it('should time out a hanging endpoint as a retryable failure', async () => {
    const { admin, finishes } = fakeAdmin();
    await sendWebhookDelivery('wd-1', { admin, fetch: hangingFetch(), lookup, timeoutMs: 20 });
    expect(finishes[0]).toMatchObject({ ok: false, retryable: true, code: null, error: 'timeout after 20 ms' });
  });

  it('should not POST to a blocked address and fail permanently', async () => {
    const { admin, finishes } = fakeAdmin();
    const fetch = vi.fn<WebhookFetch>();
    await sendWebhookDelivery('wd-1', { admin, fetch, lookup: async () => ['169.254.169.254'] });
    expect(fetch).not.toHaveBeenCalled();
    expect(finishes[0]).toMatchObject({ ok: false, retryable: false, code: null, error: 'blocked_address: 169.254.169.254' });
  });

  it('should skip a row that is not claimable (sent, not due, vanished)', async () => {
    const { admin, finishes } = fakeAdmin([]);
    const fetch = vi.fn<WebhookFetch>();
    expect(await sendWebhookDelivery('wd-1', { admin, fetch, lookup })).toEqual({ delivery_id: 'wd-1', skipped: 'not_claimed' });
    expect(fetch).not.toHaveBeenCalled();
    expect(finishes).toEqual([]);
  });
});

describe('sendWebhookDelivery private targets', () => {
  it('should refuse a private address unless private targets are allowed', async () => {
    const privateLookup = async () => ['10.1.2.3'];
    const ok: WebhookFetch = async () => new Response(null, { status: 200 });
    const denied = fakeAdmin();
    await sendWebhookDelivery('wd-1', { admin: denied.admin, fetch: ok, lookup: privateLookup });
    expect(denied.finishes[0]).toMatchObject({ ok: false, retryable: false, error: 'blocked_address: 10.1.2.3' });
    const allowed = fakeAdmin();
    await sendWebhookDelivery('wd-1', { admin: allowed.admin, fetch: ok, lookup: privateLookup, allowPrivateTargets: true });
    expect(allowed.finishes[0]).toMatchObject({ ok: true, code: 200 });
  });
});
