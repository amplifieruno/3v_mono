import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomInt, scryptSync } from 'node:crypto';

/**
 * Key material of the face authentication service (slice 9).
 *
 * A client key is a public 8-character prefix plus a secret (32 random bytes, base64url). The secret is the HMAC key
 * the client signs requests with, so the server must be able to read it: the database stores it encrypted
 * (AES-256-GCM under AUTH_KEY_ENCRYPTION_KEY, column `secret`) and, for audit / rotation fingerprints, an scrypt hash
 * (`secret_hash`). Neither column is selectable by org_admin.
 */

const PREFIX_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export type ServerKeys = {
  /** AES-256-GCM key for client key secrets at rest. */
  encryption: Buffer;
  /** HMAC key the session nonces are derived with (HKDF of the encryption key, separate purpose). */
  nonce: Buffer;
};

/** Parses AUTH_KEY_ENCRYPTION_KEY (64 hex characters = 32 bytes) into the server keys. */
export function serverKeys(hex: string): ServerKeys {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('AUTH_KEY_ENCRYPTION_KEY must be 64 hex characters');
  const encryption = Buffer.from(hex, 'hex');
  const nonce = Buffer.from(hkdfSync('sha256', encryption, Buffer.alloc(0), 'itap-auth-session-nonce', 32));
  return { encryption, nonce };
}

export function sha256(data: Buffer | string): Buffer {
  return createHash('sha256').update(data).digest();
}

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** A new client key: 8-character prefix (unambiguous alphanumerics) and a 32-byte base64url secret. */
export function generateClientKey(): { prefix: string; secret: string } {
  let prefix = '';
  for (let i = 0; i < 8; i += 1) prefix += PREFIX_ALPHABET[randomInt(PREFIX_ALPHABET.length)];
  return { prefix, secret: randomBytes(32).toString('base64url') };
}

/** scrypt fingerprint of a secret: `scrypt$N$r$p$<salt b64>$<hash b64>` (at-rest audit value; never verified per request). */
export function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** `v1:<iv>:<tag>:<ciphertext>` (base64 parts). */
export function encryptSecret(keys: ServerKeys, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keys.encryption, iv);
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}

/** Decrypts a stored secret; undefined when it is malformed or does not authenticate under the server key. */
export function decryptSecret(keys: ServerKeys, stored: string | null | undefined): string | undefined {
  const parts = stored?.split(':');
  if (!parts || parts.length !== 4 || parts[0] !== 'v1') return undefined;
  try {
    const decipher = createDecipheriv('aes-256-gcm', keys.encryption, Buffer.from(parts[1], 'base64'));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return undefined;
  }
}

/**
 * The session nonce (32 bytes): HMAC-SHA256(nonce key, session id). The session id is a random UUID chosen by the
 * server, so the nonce is unpredictable without the server key, is returned once, and is never stored — the
 * database keeps only sha256(nonce) (`nonce_hash`). Deriving it lets the server re-check a request's binding.
 */
export function sessionNonce(keys: ServerKeys, sessionId: string): Buffer {
  return createHmac('sha256', keys.nonce).update(`session:${sessionId.toLowerCase()}`).digest();
}

/** Expected binding of a sequence: hex HMAC-SHA256(key secret, nonce ‖ sequence digest ‖ utf8(device_ref)). */
export function sequenceBinding(secret: string, nonce: Buffer, digest: Buffer, deviceRef: string): string {
  return createHmac('sha256', secret).update(Buffer.concat([nonce, digest, Buffer.from(deviceRef, 'utf8')])).digest('hex');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The claimed identity of a verification as the engine sees it: a well-formed UUID in canonical lowercase text; any
 * other string maps to a name-based UUID (sha256 of the raw claim, version 8 / RFC 9562 variant bits) that cannot
 * belong to the organization — so a malformed claim follows exactly the path (and response) of an unknown one.
 * `refHash` = sha256 hex of the canonical text (the session binding, `claimed_ref_hash`).
 */
export function claimedRef(raw: string): { id: string; refHash: string } {
  let id: string;
  if (UUID.test(raw)) {
    id = raw.toLowerCase();
  } else {
    const h = sha256(`itap-claim:${raw}`);
    h[6] = (h[6] & 0x0f) | 0x80;
    h[8] = (h[8] & 0x3f) | 0x80;
    const hex = h.subarray(0, 16).toString('hex');
    id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
  return { id, refHash: sha256Hex(id) };
}
