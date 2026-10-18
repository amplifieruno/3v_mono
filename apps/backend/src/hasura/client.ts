import type { Env } from '../config/env.js';

export type HasuraSession = { role: string; userId?: string; organizationId?: string };

export type HasuraClient = {
  request<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
};

export class HasuraError extends Error {
  readonly code: string;
  readonly path?: string;

  constructor(code: string, message: string, path?: string) {
    super(message);
    this.name = 'HasuraError';
    this.code = code;
    this.path = path;
  }
}

type GraphQLResponse<T> = {
  data?: T;
  errors?: { message: string; extensions?: { code?: string; path?: string } }[];
  // Hasura top-level (non-GraphQL) error shape, e.g. a wrong admin secret
  code?: string;
  error?: string;
};

/** Parses a Hasura GraphQL HTTP response; every failure shape becomes a HasuraError. */
export async function parseHasuraResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: GraphQLResponse<T>;
  try {
    body = JSON.parse(text) as GraphQLResponse<T>;
  } catch {
    throw new HasuraError(`http-${res.status}`, `Non-JSON response from Hasura: ${text.slice(0, 200)}`);
  }
  if (body.errors?.length) {
    const [first] = body.errors;
    throw new HasuraError(first.extensions?.code ?? 'unknown', first.message, first.extensions?.path);
  }
  if (body.error || !res.ok || body.data === undefined) {
    throw new HasuraError(
      body.code ?? `http-${res.status}`,
      body.error ?? `Unexpected response from Hasura: ${text.slice(0, 200)}`,
    );
  }
  return body.data;
}

export function createHasuraClient(env: Env, session?: HasuraSession): HasuraClient {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-hasura-admin-secret': env.GRAPHQL_ADMIN_SECRET,
  };
  if (session) {
    headers['x-hasura-role'] = session.role;
    if (session.userId) headers['x-hasura-user-id'] = session.userId;
    if (session.organizationId) headers['x-hasura-organization-id'] = session.organizationId;
  }

  return {
    async request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
      const res = await fetch(env.HASURA_GRAPHQL_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables }),
      });
      return parseHasuraResponse<T>(res);
    },
  };
}
