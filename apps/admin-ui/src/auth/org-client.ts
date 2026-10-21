import type { DataError } from '@burojs/core';
import type { Membership, OrgSession } from './types';

export interface OrgClient {
  memberships(baseToken: string): Promise<{ memberships: Membership[]; lastOrganizationId: string | null }>;
  switchOrganization(baseToken: string, organizationId: string): Promise<OrgSession>;
}

export interface OrgClientOptions {
  /** Hasura GraphQL endpoint, e.g. `/v1/graphql`. */
  endpoint: string;
  fetch?: typeof fetch;
  /** The client clock the organization token's expiry is stored against. */
  now?: () => number;
}

const MEMBERSHIPS = `query ItapMemberships {
  organization_members { organization_id role status organization { name logo_file_id } }
  user_settings { last_organization_id }
}`;

const SWITCH = `mutation ItapSwitchOrganization($organization_id: uuid!) {
  switch_organization(organization_id: $organization_id) { access_token expires_at organization_id role }
}`;

const AUTH_CODES = new Set(['invalid-jwt', 'unauthenticated', 'jwt-invalid-claims', 'invalid-headers', 'account_disabled']);

interface GraphQlBody {
  data?: Record<string, unknown> | null;
  errors?: { message?: string; extensions?: { code?: string } }[];
}

/** Statuses a retry may cure: the session is kept, never ended, on these. */
function isTransient(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * An auth error only for a refused token (401 or an auth code); a timeout, a
 * rate limit or a server failure is `transport`; any other refusal (a
 * suspended organization, an inactive membership) is `forbidden`.
 */
function toError(body: GraphQlBody, status: number): DataError {
  const first = body.errors?.[0];
  const code = first?.extensions?.code ?? (status === 401 ? 'unauthenticated' : isTransient(status) ? `http-${status}` : 'unknown');
  const message = first?.message ?? 'The request failed.';
  const kind = AUTH_CODES.has(code) || status === 401 ? 'auth' : isTransient(status) ? 'transport' : 'forbidden';
  return { kind, code, message, status };
}

/** The `exp - iat` lifetime of a JWT in ms, or `null` when the token carries none. */
function jwtLifetimeMs(token: string): number | null {
  const payload = token.split('.')[1];
  if (payload === undefined) return null;
  try {
    const claims: unknown = JSON.parse(atob(payload.replace(/-/gu, '+').replace(/_/gu, '/')));
    if (typeof claims !== 'object' || claims === null) return null;
    const { exp, iat } = claims as { exp?: unknown; iat?: unknown };
    if (typeof exp !== 'number' || typeof iat !== 'number' || exp <= iat) return null;
    return (exp - iat) * 1000;
  } catch {
    return null;
  }
}

/**
 * When the organization token expires on the client's clock: now plus the
 * token's own lifetime (`exp - iat`), so a skewed client clock does not renew
 * too early (every request) or too late (expired tokens). A token without
 * those claims falls back to the server's `expires_at`; an expiry that is
 * neither is a protocol error rather than a `NaN` that renews forever.
 */
function clientExpiry(token: OrgTokenRow, now: number): number {
  const lifetime = jwtLifetimeMs(token.access_token);
  if (lifetime !== null) return now + lifetime;
  const serverExpiry = Date.parse(token.expires_at);
  if (Number.isFinite(serverExpiry)) return serverExpiry;
  throw {
    kind: 'protocol',
    code: 'bad-org-token',
    message: 'The organization token has no valid expiry.',
  } satisfies DataError;
}

interface MembershipRow {
  organization_id: string;
  role: string;
  status: string;
  organization: { name: string; logo_file_id: string | null } | null;
}

interface OrgTokenRow {
  access_token: string;
  expires_at: string;
  organization_id: string;
  role: string;
}

/** GraphQL over `fetch` as Hasura role `user`: the only calls made before an organization token exists. */
export function createOrgClient(options: OrgClientOptions): OrgClient {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const clock = options.now ?? Date.now;

  async function run(baseToken: string, query: string, variables?: Record<string, unknown>): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await doFetch(options.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${baseToken}`,
          'x-hasura-role': 'user',
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (cause) {
      throw { kind: 'transport', code: 'network', message: 'Cannot reach the server.', cause } satisfies DataError;
    }
    let body: GraphQlBody = {};
    try {
      body = (await response.json()) as GraphQlBody;
    } catch {
      // Non-JSON answers fall through to the status check.
    }
    if (body.errors?.length || !response.ok || !body.data) throw toError(body, response.status);
    return body.data;
  }

  return {
    async memberships(baseToken) {
      const data = await run(baseToken, MEMBERSHIPS);
      const rows = (data.organization_members ?? []) as MembershipRow[];
      const settings = (data.user_settings ?? []) as { last_organization_id: string | null }[];
      return {
        memberships: rows.map((row) => ({
          organizationId: row.organization_id,
          name: row.organization?.name ?? row.organization_id,
          logoFileId: row.organization?.logo_file_id ?? null,
          role: row.role,
          status: row.status,
        })),
        lastOrganizationId: settings[0]?.last_organization_id ?? null,
      };
    },
    async switchOrganization(baseToken, organizationId) {
      const data = await run(baseToken, SWITCH, { organization_id: organizationId });
      const token = data.switch_organization as OrgTokenRow;
      return {
        accessToken: token.access_token,
        expiresAt: clientExpiry(token, clock()),
        organizationId: token.organization_id,
        role: token.role,
      };
    },
  };
}
