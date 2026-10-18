import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import type { HasuraClient } from '../hasura/client.js';
import { ActionError } from './types.js';
import { switchOrganization } from './switchOrganization.js';

const env: Env = {
  HASURA_GRAPHQL_URL: 'http://hasura.test/v1/graphql',
  GRAPHQL_ADMIN_SECRET: 'admin-secret',
  HASURA_JWT_SECRET: { type: 'HS256', key: 'k'.repeat(32), issuer: 'hasura-auth' },
  ACTION_SECRET: 'action-secret',
  NHOST_STORAGE_URL: 'http://storage.test',
  ORG_TOKEN_TTL_SECONDS: 900,
};

const USER = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';

type Membership = { role: string; status: string; expires_at: string | null; organization: { status: string } };

const activeMember: Membership = { role: 'admin', status: 'active', expires_at: null, organization: { status: 'active' } };

/** Admin client mock: answers the membership query with `members`, records every other call. */
function mockAdmin(members: Membership[]) {
  const request = vi.fn(async (query: string) =>
    query.includes('SwitchOrgMembership') ? { organization_members: members } : {},
  );
  return { client: { request } as unknown as HasuraClient, request };
}

function run(members: Membership[], input: unknown = { organization_id: ORG }, userId: string | null = USER) {
  const admin = mockAdmin(members);
  const actor = mockAdmin([]);
  const promise = switchOrganization({
    env,
    input,
    session: { role: 'user', ...(userId ? { userId } : {}) },
    admin: admin.client,
    asCaller: admin.client,
    actor: actor.client,
  });
  return { promise, request: admin.request, actorRequest: actor.request };
}

async function errorCode(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ActionError);
  return (error as ActionError).code;
}

describe('switchOrganization', () => {
  it('should reject a caller who is not a member with not_a_member', async () => {
    const { promise, request } = run([]);
    expect(await errorCode(promise)).toBe('not_a_member');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('should reject a non-active membership status with membership_inactive', async () => {
    const { promise, request } = run([{ ...activeMember, status: 'suspended' }]);
    expect(await errorCode(promise)).toBe('membership_inactive');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('should reject an expired membership with membership_inactive', async () => {
    const expired = new Date(Date.now() - 1000).toISOString();
    const { promise } = run([{ ...activeMember, expires_at: expired }]);
    expect(await errorCode(promise)).toBe('membership_inactive');
  });

  it('should reject a suspended organization with organization_suspended', async () => {
    const { promise } = run([{ ...activeMember, organization: { status: 'suspended' } }]);
    expect(await errorCode(promise)).toBe('organization_suspended');
  });

  it('should reject a session without a user id and invalid input', async () => {
    expect(await errorCode(run([activeMember], { organization_id: ORG }, null).promise)).toBe('unauthenticated');
    expect(await errorCode(run([activeMember], { organization_id: 'nope' }).promise)).toBe('invalid_input');
  });

  it('should record the switch and return an org_admin token for an active membership', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const { promise, request, actorRequest } = run([{ ...activeMember, expires_at: future }], { organization_id: ORG.toUpperCase() });
    const result = await promise;

    expect(result).toMatchObject({ organization_id: ORG, role: 'org_admin' });
    expect(new Date(result.expires_at).getTime()).toBeGreaterThan(Date.now());
    const payload = jwt.verify(result.access_token, env.HASURA_JWT_SECRET.key) as Record<string, unknown>;
    expect(payload['https://hasura.io/jwt/claims']).toMatchObject({
      'x-hasura-user-id': USER,
      'x-hasura-organization-id': ORG,
      'x-hasura-default-role': 'org_admin',
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(actorRequest).toHaveBeenCalledTimes(1);
    const [query, variables] = actorRequest.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(query).toContain('insert_user_settings_one');
    expect(query).toContain('insert_audit_log_one');
    expect(variables).toEqual({ user: USER, org: ORG });
  });
});
