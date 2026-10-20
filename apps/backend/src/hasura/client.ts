import type { Env } from '../config/env.js';
import { mapAbort } from '../http/abort.js';

export type HasuraSession = { role: string; userId?: string; organizationId?: string };

export type HasuraClient = {
  request<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
};

export class HasuraError extends Error {
  readonly code: string;
  readonly path?: string;
  /** Underlying Postgres error message (Hasura exposes it to admin requests as `extensions.internal.error.message`). */
  readonly detail?: string;
  /** Postgres SQLSTATE of that error (`extensions.internal.error.status_code`), e.g. 40P01 for a deadlock. */
  readonly sqlState?: string;

  constructor(code: string, message: string, path?: string, detail?: string, sqlState?: string) {
    super(message);
    this.name = 'HasuraError';
    this.code = code;
    this.path = path;
    this.detail = detail;
    this.sqlState = sqlState;
  }
}

type GraphQLResponse<T> = {
  data?: T;
  errors?: { message: string; extensions?: { code?: string; path?: string; internal?: { error?: { message?: string; status_code?: string } } } }[];
  // Hasura top-level (non-GraphQL) error shape, e.g. a wrong admin secret
  code?: string;
  error?: string;
};

/**
 * Parses a Hasura GraphQL HTTP response; every failure shape becomes a HasuraError. `readBody` reads the text (the
 * caller maps a timeout during the read).
 */
export async function parseHasuraResponse<T>(res: Response, readBody: () => Promise<string> = () => res.text()): Promise<T> {
  const text = await readBody();
  let body: GraphQLResponse<T>;
  try {
    body = JSON.parse(text) as GraphQLResponse<T>;
  } catch {
    throw new HasuraError(`http-${res.status}`, `Non-JSON response from Hasura: ${text.slice(0, 200)}`);
  }
  if (body.errors?.length) {
    const [first] = body.errors;
    throw new HasuraError(
      first.extensions?.code ?? 'unknown',
      first.message,
      first.extensions?.path,
      first.extensions?.internal?.error?.message,
      first.extensions?.internal?.error?.status_code,
    );
  }
  if (body.error || !res.ok || body.data === undefined) {
    throw new HasuraError(
      body.code ?? `http-${res.status}`,
      body.error ?? `Unexpected response from Hasura: ${text.slice(0, 200)}`,
    );
  }
  return body.data;
}

export type HasuraClientOptions = {
  /** Per-request limit; a request still pending then fails with HasuraError code `timeout`. No limit by default. */
  timeoutMs?: number;
  /**
   * Extra session variables sent as headers with the admin secret (names must start with `x-hasura-`), e.g.
   * `x-hasura-audit-reason` (the audit trigger records it as the reason of admin-session writes).
   */
  sessionVariables?: Record<string, string>;
};

function requestFn(env: Env, headers: Record<string, string>, options: HasuraClientOptions): HasuraClient['request'] {
  return async <T>(query: string, variables?: Record<string, unknown>): Promise<T> => {
    const init: RequestInit = { method: 'POST', headers, body: JSON.stringify({ query, variables }) };
    if (options.timeoutMs !== undefined) init.signal = AbortSignal.timeout(options.timeoutMs);
    const timedOut = () => new HasuraError('timeout', `Hasura request timed out after ${options.timeoutMs} ms`);
    const res = await mapAbort(fetch(env.HASURA_GRAPHQL_URL, init), timedOut);
    // The signal also covers the body read; a timeout there is the same HasuraError, not a raw DOMException.
    return parseHasuraResponse<T>(res, () => mapAbort(res.text(), timedOut));
  };
}

export function createHasuraClient(env: Env, session?: HasuraSession, options: HasuraClientOptions = {}): HasuraClient {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-hasura-admin-secret': env.GRAPHQL_ADMIN_SECRET,
  };
  if (session) {
    headers['x-hasura-role'] = session.role;
    if (session.userId) headers['x-hasura-user-id'] = session.userId;
    if (session.organizationId) headers['x-hasura-organization-id'] = session.organizationId;
  }
  for (const [name, value] of Object.entries(options.sessionVariables ?? {})) {
    if (!/^x-hasura-[a-z0-9-]+$/i.test(name)) throw new Error(`Invalid session variable name: ${name}`);
    headers[name.toLowerCase()] = value;
  }
  return { request: requestFn(env, headers, options) };
}

/**
 * Client authenticated with a bearer token only (no admin secret): Hasura verifies the JWT and applies the role's
 * permissions exactly as for the token's owner (exports run as the requesting member, slice 10).
 */
export function createHasuraTokenClient(env: Env, token: string, options: HasuraClientOptions = {}): HasuraClient {
  return { request: requestFn(env, { 'content-type': 'application/json', authorization: `Bearer ${token}` }, options) };
}
