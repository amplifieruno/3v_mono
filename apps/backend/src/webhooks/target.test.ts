import { describe, expect, it } from 'vitest';
import { checkWebhookTarget, isBlockedAddress } from './target.js';

describe('webhook target guard', () => {
  it('should block link-local / metadata and unspecified addresses only', () => {
    for (const ip of ['169.254.169.254', '169.254.0.1', '0.0.0.0', 'fe80::1', '::', '::ffff:169.254.169.254', '::ffff:a9fe:a9fe']) {
      expect(isBlockedAddress(ip)).toBe(true);
    }
    for (const ip of ['10.0.0.5', '172.18.0.4', '127.0.0.1', '93.184.216.34', '::1', '2001:db8::1']) {
      expect(isBlockedAddress(ip)).toBe(false);
    }
  });

  it('should check literal hosts and every resolved address of a name', async () => {
    const lookup = async (host: string) => (host === 'evil.test' ? ['93.184.216.34', '169.254.169.254'] : ['172.18.0.4']);
    expect(await checkWebhookTarget('http://backend:3001/hook', lookup)).toEqual({ ok: true });
    expect(await checkWebhookTarget('https://evil.test/x', lookup)).toEqual({ ok: false, reason: 'blocked_address: 169.254.169.254' });
    // WHATWG URL parsing normalizes numeric hosts (2852039166 = 169.254.169.254).
    expect(await checkWebhookTarget('http://2852039166/latest', lookup)).toMatchObject({ ok: false });
    expect(await checkWebhookTarget('http://[fe80::1]/', lookup)).toMatchObject({ ok: false });
    expect(await checkWebhookTarget('ftp://example.com/', lookup)).toEqual({ ok: false, reason: 'invalid_url' });
    expect(await checkWebhookTarget('not a url', lookup)).toEqual({ ok: false, reason: 'invalid_url' });
    const failing = async (): Promise<string[]> => {
      throw new Error('ENOTFOUND');
    };
    expect(await checkWebhookTarget('https://nowhere.test/', failing)).toEqual({ ok: false, reason: 'dns_failed: ENOTFOUND', retryable: true });
  });
});
