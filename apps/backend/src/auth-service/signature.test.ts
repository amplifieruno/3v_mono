import { describe, expect, it } from 'vitest';
import { authorizationHeader, canonicalRequest, hexEqual, parseAuthorization, signRequest, withinSkew } from './signature.js';

describe('ITAP-HMAC signatures', () => {
  const body = Buffer.from('{"a":1}');

  it('should parse a well-formed header and refuse malformed ones', () => {
    const header = authorizationHeader('Ab3dEf7h', 'secret', 'POST', '/v1/auth/sessions', body, 1_700_000_000);
    expect(parseAuthorization(header)).toEqual({ prefix: 'Ab3dEf7h', ts: 1_700_000_000, sig: signRequest('secret', 'POST', '/v1/auth/sessions', 1_700_000_000, body) });
    for (const bad of [undefined, '', 'Bearer x', 'ITAP-HMAC key=short, ts=1, sig=' + 'a'.repeat(64), 'ITAP-HMAC key=Ab3dEf7h, ts=x, sig=' + 'a'.repeat(64), 'ITAP-HMAC key=Ab3dEf7h, ts=1, sig=zz']) {
      expect(parseAuthorization(bad)).toBeUndefined();
    }
  });

  it('should sign method, path, timestamp and the body hash', () => {
    expect(canonicalRequest('post', '/p', 5, Buffer.alloc(0))).toBe('POST\n/p\n5\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    const sig = signRequest('s', 'POST', '/p', 5, body);
    expect(signRequest('s', 'GET', '/p', 5, body)).not.toBe(sig);
    expect(signRequest('s', 'POST', '/q', 5, body)).not.toBe(sig);
    expect(signRequest('s', 'POST', '/p', 6, body)).not.toBe(sig);
    expect(signRequest('s', 'POST', '/p', 5, Buffer.from('{"a":2}'))).not.toBe(sig);
  });

  it('should compare in constant time and accept ±300 s of skew only', () => {
    expect(hexEqual('ab', 'AB')).toBe(true);
    expect(hexEqual('ab', 'abc')).toBe(false);
    expect(withinSkew(1000, 1300)).toBe(true);
    expect(withinSkew(1000, 1301)).toBe(false);
    expect(withinSkew(1301, 1000)).toBe(false);
  });
});
