import { describe, expect, it } from 'vitest';
import { checkWebhookTarget, isBlockedAddress } from './target.js';

const PRIVATE = ['127.0.0.1', '127.8.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.10', '::1', 'fc00::1', 'fd12:3456::1', '::ffff:10.0.0.1', '::ffff:7f00:1'];
const PUBLIC = ['93.184.216.34', '172.15.0.1', '172.32.0.1', '192.169.0.1', '2001:db8::1', '11.0.0.1'];
const ALWAYS = ['169.254.169.254', '169.254.0.1', '0.0.0.0', 'fe80::1', '::', '::ffff:169.254.169.254', '::ffff:a9fe:a9fe'];

describe('webhook target guard', () => {
  it('should always block link-local / metadata and unspecified addresses', () => {
    for (const ip of ALWAYS) {
      expect(isBlockedAddress(ip, true)).toBe(true);
      expect(isBlockedAddress(ip, false)).toBe(true);
    }
  });

  it('should block loopback and private ranges unless private targets are allowed', () => {
    for (const ip of PRIVATE) {
      expect(isBlockedAddress(ip, false)).toBe(true);
      expect(isBlockedAddress(ip, true)).toBe(false);
    }
    for (const ip of PUBLIC) {
      expect(isBlockedAddress(ip, false)).toBe(false);
      expect(isBlockedAddress(ip, true)).toBe(false);
    }
  });

  it('should check literal hosts and every resolved address of a name', async () => {
    const lookup = async (host: string) => (host === 'evil.test' ? ['93.184.216.34', '169.254.169.254'] : ['172.18.0.4']);
    const dev = { lookup, allowPrivate: true };
    expect(await checkWebhookTarget('http://backend:3001/hook', dev)).toEqual({ ok: true });
    expect(await checkWebhookTarget('http://backend:3001/hook', { lookup, allowPrivate: false })).toEqual({
      ok: false, reason: 'blocked_address: 172.18.0.4',
    });
    expect(await checkWebhookTarget('https://evil.test/x', dev)).toEqual({ ok: false, reason: 'blocked_address: 169.254.169.254' });
    // WHATWG URL parsing normalizes numeric hosts (2852039166 = 169.254.169.254).
    expect(await checkWebhookTarget('http://2852039166/latest', dev)).toMatchObject({ ok: false });
    expect(await checkWebhookTarget('http://[fe80::1]/', dev)).toMatchObject({ ok: false });
    expect(await checkWebhookTarget('http://127.0.0.1:3001/', { lookup, allowPrivate: false })).toMatchObject({ ok: false });
    expect(await checkWebhookTarget('ftp://example.com/', dev)).toEqual({ ok: false, reason: 'invalid_url' });
    expect(await checkWebhookTarget('not a url', dev)).toEqual({ ok: false, reason: 'invalid_url' });
    const failing = async (): Promise<string[]> => {
      throw new Error('ENOTFOUND');
    };
    expect(await checkWebhookTarget('https://nowhere.test/', { lookup: failing, allowPrivate: true })).toEqual({
      ok: false, reason: 'dns_failed: ENOTFOUND', retryable: true,
    });
  });

  it('should time out a hanging DNS lookup as a retryable failure', async () => {
    const hanging = () => new Promise<string[]>(() => undefined);
    expect(await checkWebhookTarget('https://slow.test/', { lookup: hanging, allowPrivate: true, dnsTimeoutMs: 20 })).toEqual({
      ok: false, reason: 'dns_failed: timeout after 20 ms', retryable: true,
    });
  });
});
