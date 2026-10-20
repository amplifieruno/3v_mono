import { describe, expect, it, vi } from 'vitest';
import { classify, probe, worst } from './probes.js';

describe('classify', () => {
  it('should be ok when fast, degraded when slow and down on failure', () => {
    expect(classify(true, 20)).toBe('ok');
    expect(classify(true, 1500)).toBe('degraded');
    expect(classify(false, 5)).toBe('down');
  });
});

describe('worst', () => {
  it('should return the most severe level (ok when empty)', () => {
    expect(worst([])).toBe('ok');
    expect(worst(['ok', 'degraded', 'ok'])).toBe('degraded');
    expect(worst(['degraded', 'down'])).toBe('down');
  });
});

describe('probe', () => {
  it('should report status, latency and details of an HTTP health endpoint', async () => {
    const fetchFn = vi.fn(async () => new Response('{"models":{"rec_name":"w600k"}}', { status: 200 }));
    const check = await probe('insightface', 'http://x/info', { fetch: fetchFn, details: (body) => ({ model: JSON.parse(body).models.rec_name }) });
    expect(check).toMatchObject({ name: 'insightface', status: 'ok', details: { model: 'w600k' } });
    expect(check.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('should report down with the error on a non-2xx answer or a network failure', async () => {
    const bad = await probe('storage', 'http://x', { fetch: async () => new Response('no', { status: 503 }) });
    expect(bad).toMatchObject({ status: 'down', details: { error: 'HTTP 503' } });
    const failed = await probe('stream_server', 'http://x', {
      fetch: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect(failed).toMatchObject({ status: 'down', details: { error: 'ECONNREFUSED' } });
  });
});
