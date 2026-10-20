import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { decryptSecret, type ServerKeys } from './crypto.js';
import { sendServiceError, ServiceError, unauthorized } from './errors.js';
import type { TokenBuckets } from './rateLimit.js';
import { hexEqual, parseAuthorization, signRequest, withinSkew } from './signature.js';
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
  now?: () => number;
};

/**
 * Key auth of /v1/auth/* (raw body already read into req.body as a Buffer): ITAP-HMAC signature by key prefix, ±300 s
 * skew, constant-time comparison, revoked / expired keys and non-active applications refused, per-key token bucket.
 * Unknown keys, bad signatures and undecryptable secrets answer the same 401.
 */
export function requireClientKey(deps: KeyAuthDeps) {
  const touched = new Map<string, number>();
  const now = deps.now ?? Date.now;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = requestIdOf(req);
    res.locals.requestId = requestId;
    const fail = (error: ServiceError, headers: Record<string, string> = {}) => sendServiceError(res, requestId, error, headers);
    try {
      const header = parseAuthorization(req.header('authorization'));
      if (!header) return fail(unauthorized());
      if (!withinSkew(header.ts, Math.floor(now() / 1000))) {
        return fail(new ServiceError(401, 'timestamp_skew', 'The request timestamp is more than 300 s from the server clock'));
      }
      const key = await deps.store.keyByPrefix(header.prefix);
      const secret = key ? decryptSecret(deps.keys, key.secret) : undefined;
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const expected = signRequest(secret ?? 'invalid', req.method, req.originalUrl, header.ts, body);
      if (!key || !secret || !hexEqual(expected, header.sig)) return fail(unauthorized());
      if (key.revoked_at) return fail(new ServiceError(401, 'key_revoked', 'The key was revoked'));
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
