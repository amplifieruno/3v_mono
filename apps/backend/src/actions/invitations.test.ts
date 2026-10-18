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
  const admin = mockAdmin((q) => (q.includes('InviteActiveMember') ? { organization_members: [] } : {}));
  const actor = mockAdmin(responder);
  const promise = inviteMember({
    env,
    input,
    session: { role: 'org_admin', userId: USER, ...(organizationId ? { organizationId } : {}) },
    admin: admin.client,
    asCaller: admin.client,
    actor: actor.client,
  });
  return { promise, request: admin.request, actorRequest: actor.request };
}

const inviteResponder: Responder = (query) => {
  if (query.includes('CreateInvitation')) return { insert_organization_invitations_one: { id: INV, expires_at: 'x' } };
  return {};
};

describe('inviteMember', () => {
  it('should store the sha256 of the returned token, normalized email and a 7-day expiry', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const { promise, actorRequest: request } = runInvite(inviteResponder);
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
    const admin = mockAdmin(() => ({ organization_members: [{ id: 'm' }] }));
    const actor = mockAdmin(inviteResponder);
    const promise = inviteMember({
      env,
      input: { email: 'a@b.co' },
      session: { role: 'org_admin', userId: USER, organizationId: ORG },
      admin: admin.client,
      asCaller: admin.client,
      actor: actor.client,
    });
    expect(await errorCode(promise)).toBe('already_member');
    expect(actor.request).not.toHaveBeenCalled();
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

function runAccept(opts: { email?: string | null; claim?: () => unknown }) {
  const admin = mockAdmin(() => ({ users: opts.email === null ? [] : [{ email: opts.email ?? 'me@itap.test' }] }));
  const actor = mockAdmin(opts.claim ?? (() => ({ claim_invitation: [{ organization_id: ORG }] })));
  const promise = acceptInvitation({
    env,
    input: { token: 'tok' },
    session: { role: 'user', userId: USER },
    admin: admin.client,
    asCaller: admin.client,
    actor: actor.client,
  });
  return { promise, actorRequest: actor.request };
}

describe('acceptInvitation', () => {
  it('should claim by token hash with the caller email via the actor client', async () => {
    const { promise, actorRequest } = runAccept({});
    await expect(promise).resolves.toEqual({ organization_id: ORG });
    const [query, variables] = actorRequest.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(query).toContain('claim_invitation');
    expect(variables).toEqual({ hash: createHash('sha256').update('tok').digest('hex'), user: USER, email: 'me@itap.test' });
  });

  it.each([
    'invitation_not_found',
    'invitation_not_pending',
    'invitation_expired',
    'email_mismatch',
    'already_member',
  ])('should map the %s database error to an action error', async (code) => {
    const { promise } = runAccept({
      claim: () => {
        throw new HasuraError('unexpected', 'database query error', '$', code);
      },
    });
    expect(await errorCode(promise)).toBe(code);
  });

  it('should rethrow unrecognized errors', async () => {
    const { promise } = runAccept({
      claim: () => {
        throw new HasuraError('unexpected', 'boom', '$', 'something else');
      },
    });
    await expect(promise).rejects.toThrow('boom');
  });

  it('should report email_mismatch when the caller has no account email', async () => {
    expect(await errorCode(runAccept({ email: null }).promise)).toBe('email_mismatch');
  });

  it('should require a user id', async () => {
    const admin = mockAdmin(() => ({}));
    const promise = acceptInvitation({
      env,
      input: { token: 'tok' },
      session: { role: 'user' },
      admin: admin.client,
      asCaller: admin.client,
      actor: admin.client,
    });
    expect(await errorCode(promise)).toBe('unauthenticated');
  });
});
