import { loadEnv, type Env } from '../../../src/config/env.js';
import { signBaseToken, signOrgToken } from '../../../src/auth/hasuraJwt.js';
import { createHasuraClient, HasuraError, type HasuraClient } from '../../../src/hasura/client.js';

let cachedEnv: Env | undefined;

export function testEnv(): Env {
  cachedEnv ??= loadEnv();
  return cachedEnv;
}

type GraphQLBody = {
  data?: unknown;
  errors?: { message: string; extensions?: { code?: string; path?: string } }[];
  // Hasura top-level (non-GraphQL) error shape
  code?: string;
  error?: string;
};

/** Client that authenticates with a bearer token only (no admin secret) — exercises real JWT validation. */
export function asBearer(token: string): HasuraClient {
  const env = testEnv();
  return {
    async request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
      const res = await fetch(env.HASURA_GRAPHQL_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ query, variables }),
      });
      const text = await res.text();
      let body: GraphQLBody;
      try {
        body = JSON.parse(text) as GraphQLBody;
      } catch {
        throw new HasuraError(`http-${res.status}`, `Non-JSON response: ${text.slice(0, 200)}`);
      }
      if (body.errors?.length) {
        const [first] = body.errors;
        throw new HasuraError(first.extensions?.code ?? 'unknown', first.message, first.extensions?.path);
      }
      if (body.error || !res.ok || body.data === undefined) {
        throw new HasuraError(
          body.code ?? `http-${res.status}`,
          body.error ?? `Unexpected response: ${text.slice(0, 200)}`,
        );
      }
      return body.data as T;
    },
  };
}

/** Admin-secret client (bypasses permissions). */
export function asAdmin(): HasuraClient {
  return createHasuraClient(testEnv());
}

/** Role `user` via a real signed base token. */
export function asUser(userId: string, ttlSeconds = 300): HasuraClient {
  const { token } = signBaseToken({ userId, ttlSeconds }, testEnv().HASURA_JWT_SECRET);
  return asBearer(token);
}

/** Role `org_admin` scoped to `orgId` via a real signed org token. */
export function asOrgAdmin(userId: string, orgId: string, ttlSeconds = 300): HasuraClient {
  const { token } = signOrgToken(
    { userId, organizationId: orgId, role: 'org_admin', ttlSeconds },
    testEnv().HASURA_JWT_SECRET,
  );
  return asBearer(token);
}

/** Real signed org token (role `org_admin`) for callers that need the raw bearer, e.g. storage uploads. */
export function orgAdminToken(userId: string, orgId: string, ttlSeconds = 300): string {
  return signOrgToken(
    { userId, organizationId: orgId, role: 'org_admin', ttlSeconds },
    testEnv().HASURA_JWT_SECRET,
  ).token;
}

/** Base token (role `user`). */
export function userToken(userId: string, ttlSeconds = 300): string {
  return signBaseToken({ userId, ttlSeconds }, testEnv().HASURA_JWT_SECRET).token;
}
