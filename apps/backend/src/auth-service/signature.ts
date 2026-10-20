import { createHmac, timingSafeEqual } from 'node:crypto';
import { sha256Hex } from './crypto.js';

/**
 * Request signatures: `Authorization: ITAP-HMAC key=<prefix>, ts=<unix seconds>, sig=<hex>` where
 * sig = hex HMAC-SHA256(key secret, `METHOD\nPATH\nTS\nhex sha256(raw body)`). PATH is the request path with its query
 * string as sent (e.g. `/v1/auth/sessions`); an empty body hashes the empty string. When the request carries an
 * `X-Request-Id` header its value is appended as a fifth line (`\n<request id>`), so the id is covered too and two
 * otherwise identical requests in the same second get distinct signatures (each signature is accepted once).
 * Timestamps are accepted within ±MAX_SKEW_SECONDS of the server clock.
 */

export const MAX_SKEW_SECONDS = 300;

export type SignedHeader = { prefix: string; ts: number; sig: string };

/** Parses the Authorization header; undefined when it is not a well-formed ITAP-HMAC header. */
export function parseAuthorization(header: string | undefined): SignedHeader | undefined {
  if (!header) return undefined;
  const match = /^ITAP-HMAC\s+(.+)$/.exec(header.trim());
  if (!match) return undefined;
  const fields = new Map<string, string>();
  for (const part of match[1].split(',')) {
    const [name, ...rest] = part.trim().split('=');
    if (!name || rest.length === 0) return undefined;
    fields.set(name.trim().toLowerCase(), rest.join('=').trim());
  }
  const prefix = fields.get('key') ?? '';
  const ts = fields.get('ts') ?? '';
  const sig = (fields.get('sig') ?? '').toLowerCase();
  if (!/^[A-Za-z0-9]{8}$/.test(prefix) || !/^\d{1,12}$/.test(ts) || !/^[0-9a-f]{64}$/.test(sig)) return undefined;
  return { prefix, ts: Number(ts), sig };
}

export function canonicalRequest(method: string, path: string, ts: number, body: Buffer, requestId?: string): string {
  const base = `${method.toUpperCase()}\n${path}\n${ts}\n${sha256Hex(body)}`;
  return requestId === undefined ? base : `${base}\n${requestId}`;
}

export function signRequest(secret: string, method: string, path: string, ts: number, body: Buffer, requestId?: string): string {
  return createHmac('sha256', secret).update(canonicalRequest(method, path, ts, body, requestId)).digest('hex');
}

/** Constant-time comparison of two hex strings of the same expected length. */
export function hexEqual(a: string, b: string): boolean {
  const left = Buffer.from(a.toLowerCase(), 'utf8');
  const right = Buffer.from(b.toLowerCase(), 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function withinSkew(ts: number, nowSeconds: number): boolean {
  return Math.abs(nowSeconds - ts) <= MAX_SKEW_SECONDS;
}

/** The value of an Authorization header for a request (clients, tests). */
export function authorizationHeader(
  prefix: string,
  secret: string,
  method: string,
  path: string,
  body: Buffer,
  ts: number,
  requestId?: string,
): string {
  return `ITAP-HMAC key=${prefix}, ts=${ts}, sig=${signRequest(secret, method, path, ts, body, requestId)}`;
}
