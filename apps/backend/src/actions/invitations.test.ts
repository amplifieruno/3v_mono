import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import { HasuraError, type HasuraClient } from '../hasura/client.js';
import { acceptInvitation, inviteMember } from './invitations.js';
import { ActionError } from './types.js';

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
const INV = '33333333-3333-4333-8333-333333333333';

type Responder = (query: string, variables?: Record<string, unknown>) => unknown;

function mockAdmin(responder: Responder) {
  const request = vi.fn(async (query: string, variables?: Record<string, unknown>) => responder(query, variables));
  return { client: { request } as unknown as HasuraClient, request };
}

async function errorCode(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ActionError);
  return (error as ActionError).code;
}

afterEach(() => vi.restoreAllMocks());

function runInvite(responder: Responder, input: unknown = { email: ' New@Itap.Test ' }, organizationId: string | null = ORG) {
  const admin = mockAdmin(responder);
  const promise = inviteMember({
    env,
    input,
    session: { role: 'org_admin', userId: USER, ...(organizationId ? { organizationId } : {}) },
    admin: admin.client,
    asCaller: admin.client,
  });
  return { promise, request: admin.request };
}

const inviteResponder: Responder = (query) => {
  if (query.includes('InviteActiveMember')) return { organization_members: [] };
  if (query.includes('CreateInvitation')) return { insert_organization_invitations_one: { id: INV, expires_at: 'x' } };
  return {};
};

describe('inviteMember', () => {
  it('should store the sha256 of the returned token, normalized email and a 7-day expiry', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const { promise, request } = runInvite(inviteResponder);
    const out = await promise;

    expect(out.invitation_id).toBe(INV);
    expect(out.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const create = request.mock.calls.find(([q]) => q.includes('CreateInvitation'));
    const object = (create?.[1] as { object: Record<string, unknown> }).object;
    expect(object).toMatchObject({
      organization_id: ORG,
      email: 'new@itap.test',
      role: 'admin',
      invited_by: USER,
      token_hash: createHash('sha256').update(out.token).digest('hex'),
    });
    const days = (new Date(out.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"event":"invitation_email"'));
  });

  it('should reject an active member with already_member', async () => {
    const { promise } = runInvite((q) => (q.includes('InviteActiveMember') ? { organization_members: [{ id: 'm' }] } : {}));
    expect(await errorCode(promise)).toBe('already_member');
  });

  it('should map a unique violation to already_invited', async () => {
    const { promise } = runInvite((q) => {
      if (q.includes('CreateInvitation')) {
        throw new HasuraError('constraint-violation', 'Uniqueness violation. duplicate key value');
      }
      return inviteResponder(q);
    });
    expect(await errorCode(promise)).toBe('already_invited');
  });

  it('should reject an invalid email or role with invalid_input', async () => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    expect(await errorCode(runInvite(inviteResponder, { email: 'nope' }).promise)).toBe('invalid_input');
    expect(await errorCode(runInvite(inviteResponder, { email: 'a@b.co', role: 'root' }).promise)).toBe('invalid_input');
  });

  it('should accept a null role as the default', async () => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await expect(runInvite(inviteResponder, { email: 'a@b.co', role: null }).promise).resolves.toBeDefined();
  });

  it('should require an organization session', async () => {
    expect(await errorCode(runInvite(inviteResponder, { email: 'a@b.co' }, null).promise)).toBe('unauthenticated');
  });
});

type Inv = { id: string; organization_id: string; email: string; role: string; status: string; expires_at: string };
const future = new Date(Date.now() + 3_600_000).toISOString();
const pending: Inv = { id: INV, organization_id: ORG, email: 'Me@itap.test', role: 'admin', status: 'pending', expires_at: future };

function runAccept(opts: { inv?: Inv; email?: string; member?: { id: string; status: string }; affected?: number }) {
  const admin = mockAdmin((q) => {
    if (q.includes('FindInvitation')) {
      return { organization_invitations: opts.inv ? [opts.inv] : [], users: [{ email: opts.email ?? 'me@itap.test' }] };
    }
    if (q.includes('FindMembership')) return { organization_members: opts.member ? [opts.member] : [] };
    if (q.includes('MarkAccepted')) return { update_organization_invitations: { affected_rows: opts.affected ?? 1 } };
    return {};
  });
  const promise = acceptInvitation({
    env,
    input: { token: 'tok' },
    session: { role: 'user', userId: USER },
    admin: admin.client,
    asCaller: admin.client,
  });
  return { promise, request: admin.request };
}

const called = (request: ReturnType<typeof mockAdmin>['request'], name: string) =>
  request.mock.calls.some(([q]) => q.includes(name));

describe('acceptInvitation', () => {
  it('should look up by token hash and create the membership', async () => {
    const { promise, request } = runAccept({ inv: pending });
    await expect(promise).resolves.toEqual({ organization_id: ORG });
    const lookup = request.mock.calls.find(([q]) => q.includes('FindInvitation'));
    expect((lookup?.[1] as { hash: string }).hash).toBe(createHash('sha256').update('tok').digest('hex'));
    expect(called(request, 'CreateMember')).toBe(true);
    expect(called(request, 'MarkAccepted')).toBe(true);
  });

  it('should reactivate a deactivated membership instead of inserting', async () => {
    const { promise, request } = runAccept({ inv: pending, member: { id: 'm1', status: 'deactivated' } });
    await promise;
    expect(called(request, 'ReactivateMember')).toBe(true);
    expect(called(request, 'CreateMember')).toBe(false);
  });

  it('should leave an already active membership untouched', async () => {
    const { promise, request } = runAccept({ inv: pending, member: { id: 'm1', status: 'active' } });
    await promise;
    expect(called(request, 'ReactivateMember')).toBe(false);
    expect(called(request, 'CreateMember')).toBe(false);
  });

  it('should reject an unknown token', async () => {
    expect(await errorCode(runAccept({}).promise)).toBe('invitation_not_found');
  });

  it('should reject a non-pending invitation', async () => {
    expect(await errorCode(runAccept({ inv: { ...pending, status: 'revoked' } }).promise)).toBe('invitation_not_pending');
  });

  it('should reject an expired invitation', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(await errorCode(runAccept({ inv: { ...pending, expires_at: past } }).promise)).toBe('invitation_expired');
  });

  it('should reject a different email without touching memberships', async () => {
    const { promise, request } = runAccept({ inv: pending, email: 'other@itap.test' });
    expect(await errorCode(promise)).toBe('email_mismatch');
    expect(called(request, 'CreateMember')).toBe(false);
  });

  it('should report invitation_not_pending when a concurrent accept wins the claim', async () => {
    expect(await errorCode(runAccept({ inv: pending, affected: 0 }).promise)).toBe('invitation_not_pending');
  });
});
