import { describe, expect, it } from 'vitest';
import {
  claimedRef,
  decryptSecret,
  encryptSecret,
  generateClientKey,
  hashSecret,
  sequenceBinding,
  serverKeys,
  sessionNonce,
  sha256,
  sha256Hex,
} from './crypto.js';

const keys = serverKeys('a'.repeat(64));

describe('auth-service crypto', () => {
  it('should refuse a server key that is not 64 hex characters', () => {
    expect(() => serverKeys('abc')).toThrow(/64 hex/);
  });

  it('should generate an 8-character alphanumeric prefix and a 32-byte secret', () => {
    const { prefix, secret } = generateClientKey();
    expect(prefix).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(Buffer.from(secret, 'base64url')).toHaveLength(32);
    expect(generateClientKey().secret).not.toBe(secret);
  });

  it('should round-trip an encrypted secret and refuse tampering or another server key', () => {
    const stored = encryptSecret(keys, 'my-secret');
    expect(stored).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(stored).not.toContain('my-secret');
    expect(decryptSecret(keys, stored)).toBe('my-secret');
    const parts = stored.split(':');
    const flipped = Buffer.from(parts[3], 'base64');
    flipped[0] ^= 1;
    expect(decryptSecret(keys, [parts[0], parts[1], parts[2], flipped.toString('base64')].join(':'))).toBeUndefined();
    expect(decryptSecret(serverKeys('b'.repeat(64)), stored)).toBeUndefined();
    expect(decryptSecret(keys, null)).toBeUndefined();
    expect(decryptSecret(keys, 'garbage')).toBeUndefined();
  });

  it('should hash secrets with scrypt and a random salt', () => {
    expect(hashSecret('s')).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(hashSecret('s')).not.toBe(hashSecret('s'));
  });

  it('should derive a stable 32-byte nonce per session that depends on the server key', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(sessionNonce(keys, id)).toHaveLength(32);
    expect(sessionNonce(keys, id).equals(sessionNonce(keys, id.toUpperCase()))).toBe(true);
    expect(sessionNonce(keys, id).equals(sessionNonce(serverKeys('c'.repeat(64)), id))).toBe(false);
  });

  it('should bind a sequence to nonce, digest and device', () => {
    const nonce = Buffer.alloc(32, 1);
    const digest = sha256('frames');
    const base = sequenceBinding('secret', nonce, digest, 'kiosk-1');
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(sequenceBinding('secret', Buffer.alloc(32, 2), digest, 'kiosk-1')).not.toBe(base);
    expect(sequenceBinding('secret', nonce, sha256('other'), 'kiosk-1')).not.toBe(base);
    expect(sequenceBinding('secret', nonce, digest, 'kiosk-2')).not.toBe(base);
    expect(sequenceBinding('other', nonce, digest, 'kiosk-1')).not.toBe(base);
  });

  it('should canonicalize claimed ids to lowercase uuid text and map malformed claims to a name-based uuid', () => {
    const id = '0F8FAD5B-D9CB-469F-A165-70867728950E';
    expect(claimedRef(id)).toEqual({ id: id.toLowerCase(), refHash: sha256Hex(id.toLowerCase()) });
    const bad = claimedRef('not-a-uuid');
    expect(bad.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(claimedRef('not-a-uuid')).toEqual(bad);
    expect(claimedRef('not-a-uuid2').id).not.toBe(bad.id);
    expect(bad.refHash).toBe(sha256Hex(bad.id));
  });
});
