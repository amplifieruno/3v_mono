import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { decryptSecret, type ServerKeys } from './crypto.js';
import { sendServiceError, ServiceError, unauthorized } from './errors.js';
import type { TokenBuckets } from './rateLimit.js';
import { hexEqual, MAX_SKEW_SECONDS, parseAuthorization, signRequest, withinSkew } from './signature.js';
import type { AuthStore } from './store.js';

/** The authenticated caller, set on res.locals.client by requireClientKey. */
export type AuthClient = {
  organizationId: string;
  applicationId: string;
  keyId: string;
  secret: string;
  isSandbox: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** last_used_at is written at most once per minute per key (and per process). */
const TOUCH_INTERVAL_MS = 60_000;

/** Request id: the client's X-Request-Id when it is a UUID (FS AuthenticationRequest.id), else a new one. */
export function requestIdOf(req: Request): string {
  const sent = req.header('x-request-id');
  return sent && UUID.test(sent) ? sent.toLowerCase() : randomUUID();
}

export type KeyAuthDeps = {
  store: AuthStore;
  keys: ServerKeys;
  buckets: TokenBuckets;
  replays?: ReplayCache;
  now?: () => number;
};

/**
 * Accepted signatures (per process): a signed request is accepted once. An entry lives until its header timestamp
 * leaves the skew window (`ts + MAX_SKEW_SECONDS + 1` s): from then on the timestamp check refuses the request anyway.
 */
export class ReplayCache {
  private readonly entries = new Map<string, number>();

  /** True while `id` is remembered (its expiry, epoch ms, is still ahead of `now`). */
  seen(id: string, now: number): boolean {
    const until = this.entries.get(id);
    return until !== undefined && until > now;
  }

  /** Remembers `id` until `until` (epoch ms); expired entries are pruned when the cache grows. */
  record(id: string, until: number, now = Date.now()): void {
    this.entries.set(id, until);
    if (this.entries.size > 50_000) {
      for (const [key, expiry] of this.entries) if (expiry <= now) this.entries.delete(key);
    }
  }
}

/** Expiry (epoch ms) of a replay cache entry for a request signed at `ts` (unix seconds). */
export const replayExpiry = (ts: number): number => (ts + MAX_SKEW_SECONDS + 1) * 1000;

/**
 * Cheap guard mounted before the body parser: a request without a well-formed ITAP-HMAC header is refused with the
 * same 401 as a bad signature, without reading (or buffering) its body.
 */
export function requireAuthorizationHeader(req: Request, res: Response, next: NextFunction): void {
  if (parseAuthorization(req.header('authorization'))) return next();
  const requestId = requestIdOf(req);
  res.locals.requestId = requestId;
  res.setHeader('connection', 'close');
  sendServiceError(res, requestId, unauthorized());
}

/**
 * Key auth of /v1/auth/* (raw body already read into req.body as a Buffer): ITAP-HMAC signature by key prefix, ±300 s
 * skew, constant-time comparison, revoked / expired keys and non-active applications refused, per-key token bucket.
 * Unknown keys, bad signatures and undecryptable secrets answer the same 401. A revoked key is answered `key_revoked`
 * by its prefix alone (revocation clears its ciphertext, so its signature can no longer be checked). A signature is
 * recorded in the replay cache only once every check passed (a request refused for an expired key, an inactive
 * application or the rate limit can be sent again unchanged); the replay lookup precedes the rate limit so replays
 * never drain the key's bucket. Lookup, checks and recording run without an await in between.
 */
export function requireClientKey(deps: KeyAuthDeps) {
  const touched = new Map<string, number>();
  const replays = deps.replays ?? new ReplayCache();
  const now = deps.now ?? Date.now;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = requestIdOf(req);
    res.locals.requestId = requestId;
    const fail = (error: ServiceError, headers: Record<string, string> = {}) => sendServiceError(res, requestId, error, headers);
    try {
      const header = parseAuthorization(req.header('authorization'));
      if (!header) return fail(unauthorized());
      if (!withinSkew(header.ts, Math.floor(now() / 1000))) {
        return fail(
          new ServiceError(401, 'timestamp_skew', 'The request timestamp is more than 300 s from the server clock', true, 'Synchronize the client clock and sign a new request.'),
        );
      }
      const key = await deps.store.keyByPrefix(header.prefix);
      if (key?.revoked_at) return fail(new ServiceError(401, 'key_revoked', 'The key was revoked'));
      const secret = key ? decryptSecret(deps.keys, key.secret, header.prefix) : undefined;
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const expected = signRequest(secret ?? 'invalid', req.method, req.originalUrl, header.ts, body, req.header('x-request-id'));
      if (!key || !secret || !hexEqual(expected, header.sig)) return fail(unauthorized());
      // Exact request replay (same key and signature) while its timestamp is inside the skew window: refused.
      const replayId = `${header.prefix}:${header.sig}`;
      if (replays.seen(replayId, now())) {
        return fail(new ServiceError(401, 'replayed_request', 'This signed request was already received'));
      }
      if (key.expires_at && new Date(key.expires_at).getTime() <= now()) {
        return fail(new ServiceError(401, 'key_expired', 'The key expired'));
      }
      if (key.application?.status !== 'active') {
        return fail(new ServiceError(403, 'application_inactive', 'The client application is not active'));
      }
      if (!deps.buckets.take(key.id)) {
        const retryAfter = deps.buckets.retryAfter(key.id);
        return fail(new ServiceError(429, 'rate_limited', 'Too many requests for this key', true, `Retry after ${retryAfter} s.`), {
          'retry-after': String(retryAfter),
        });
      }
      replays.record(replayId, replayExpiry(header.ts), now());
      const last = touched.get(key.id) ?? (key.last_used_at ? new Date(key.last_used_at).getTime() : 0);
      if (now() - last >= TOUCH_INTERVAL_MS) {
        touched.set(key.id, now());
        void deps.store.touchKey(key.id, new Date(now())).catch(() => touched.delete(key.id));
      }
      const client: AuthClient = {
        organizationId: key.organization_id,
        applicationId: key.application_id,
        keyId: key.id,
        secret,
        isSandbox: key.application.is_sandbox,
      };
      res.locals.client = client;
      next();
    } catch (error: unknown) {
      next(error);
    }
  };
}
