import type { DataError } from '@burojs/core';
import type { BaseSession } from './types';

export interface NhostClient {
  signIn(email: string, password: string): Promise<BaseSession>;
  refresh(refreshToken: string): Promise<BaseSession>;
  signOut(refreshToken: string): Promise<void>;
}

export interface NhostClientOptions {
  /** hasura-auth root including its version prefix, e.g. `/auth/v1` through the dev proxy. */
  baseUrl: string;
  fetch?: typeof fetch;
  now?: () => number;
}

interface WireSession {
  accessToken?: unknown;
  accessTokenExpiresIn?: unknown;
  refreshToken?: unknown;
  user?: { id?: unknown; email?: unknown; displayName?: unknown };
}

/** Statuses a retry may cure: a timeout, a rate limit, a server failure. */
function isTransient(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function fail(kind: DataError['kind'], code: string, message: string, status?: number): DataError {
  return status === undefined ? { kind, code, message } : { kind, code, message, status };
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string') {
    return body.message;
  }
  return fallback;
}

function toSession(body: unknown, now: number): BaseSession {
  const wire = (typeof body === 'object' && body !== null && 'session' in body ? body.session : body) as WireSession | null;
  if (
    !wire ||
    typeof wire.accessToken !== 'string' ||
    typeof wire.refreshToken !== 'string' ||
    typeof wire.accessTokenExpiresIn !== 'number' ||
    !wire.user ||
    typeof wire.user.id !== 'string' ||
    typeof wire.user.email !== 'string'
  ) {
    throw fail('protocol', 'bad-session', 'The sign-in service returned an unexpected response.');
  }
  return {
    accessToken: wire.accessToken,
    refreshToken: wire.refreshToken,
    expiresAt: now + wire.accessTokenExpiresIn * 1000,
    user: {
      id: wire.user.id,
      email: wire.user.email,
      displayName: typeof wire.user.displayName === 'string' ? wire.user.displayName : '',
    },
  };
}

/** Thin fetch client for hasura-auth: email/password sign-in, refresh-token exchange, sign-out. */
export function createNhostClient(options: NhostClientOptions): NhostClient {
  const base = options.baseUrl.replace(/\/+$/, '');
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const clock = options.now ?? Date.now;

  async function post(path: string, payload: unknown): Promise<{ response: Response; body: unknown }> {
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (cause) {
      throw { ...fail('transport', 'network', 'Cannot reach the sign-in service.'), cause } satisfies DataError;
    }
    return { response, body: await readBody(response) };
  }

  return {
    async signIn(email, password) {
      const { response, body } = await post('/signin/email-password', { email, password });
      if (!response.ok) {
        const transient = isTransient(response.status);
        const code = transient ? 'sign-in-unavailable' : 'invalid-credentials';
        throw fail(transient ? 'transport' : 'auth', code, errorMessage(body, 'Sign-in failed.'), response.status);
      }
      return toSession(body, clock());
    },
    async refresh(refreshToken) {
      const { response, body } = await post('/token', { refreshToken });
      if (!response.ok) {
        // Only a refused token ends the session; anything else (rate limit, outage) keeps it for a retry.
        const rejected = response.status === 401 || response.status === 400;
        if (!rejected) {
          throw fail('transport', 'refresh-unavailable', errorMessage(body, 'Cannot renew the session now.'), response.status);
        }
        throw fail('auth', 'refresh-rejected', errorMessage(body, 'The session has expired.'), response.status);
      }
      return toSession(body, clock());
    },
    async signOut(refreshToken) {
      await post('/signout', { refreshToken });
    },
  };
}
