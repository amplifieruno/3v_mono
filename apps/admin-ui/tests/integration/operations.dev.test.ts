import {
  type DataProvider,
  type MutationContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { createItapHasuraProvider } from '../../src/data/provider';
import { INVITATION_RESOURCE } from '../../src/modules/organization/invitations';
import { MEMBER_RESOURCE } from '../../src/modules/organization/members';
import { OVERVIEW_BINDING, dashboardKpisOutput } from '../../src/modules/overview/kpis';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, signInDev } from '../support/dev-stack';
import { offsetPage } from '../support/pagination';

/**
 * The custom operations and the organization resources through the console's
 * own Hasura provider, signed in to Nova Tower as `org_admin`. Needs the dev
 * stack and the seed. The invitation it creates is revoked at the end.
 */

const IDENTITY = {
  providerId: 'hasura',
  sessionKey: 'operations-dev-test',
  scopeKey: null,
  bindingRevision: '1',
} as const;

function context(): MutationContext {
  return {
    signal: new AbortController().signal,
    requestContext: {},
    session: { sessionKey: IDENTITY.sessionKey, scopeKey: null, generation: 1 },
    providerServiceKey: 'hasura',
    idempotencyKey: crypto.randomUUID(),
  };
}

const ref = (id: string) => ({ namespace: 'default', id });

describe.skipIf(!DEV_STACK_ENABLED)('custom operations against the dev stack (Nova Tower)', () => {
  let provider: DataProvider;

  beforeAll(async () => {
    const auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
  });

  it('should read the dashboard KPIs as numbers', async () => {
    const descriptor = createQueryDescriptor({
      ...IDENTITY,
      kind: 'custom',
      ref: ref('dashboard-kpis'),
      resource: OVERVIEW_BINDING,
      operation: 'dashboardKpis',
      input: {},
    } as never);
    const kpis = await provider.queries?.custom?.(descriptor as never, context());
    const parsed = dashboardKpisOutput.parse(kpis);
    expect(parsed).not.toBeNull();
    expect(parsed?.unique_visitors_today).toBeGreaterThanOrEqual(0);
  });

  it('should list members with their account email across the user relationship', async () => {
    const descriptor = createQueryDescriptor({
      ...IDENTITY,
      kind: 'list',
      ref: ref(MEMBER_RESOURCE),
      resource: MEMBER_RESOURCE,
      pagination: offsetPage(1, 50),
      paths: {
        user_id: { field: 'user_id', resource: 'user', providerOptions: { relationship: 'user' } },
      },
      relationColumns: ['user_id.email'],
    } as never);
    const result = (await provider.queries?.list?.(descriptor as never, context())) as {
      data: readonly Record<string, unknown>[];
    };
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.map((row) => row['user_id.email'])).toContain('nova.admin@itap.demo');
  });

  it('should create a pending invitation visible through organization_invitation', async () => {
    const email = `invite-${Date.now()}@itap.test`;
    const invite = createMutationDescriptor({
      ...IDENTITY,
      kind: 'custom',
      ref: ref('invite-member'),
      resource: INVITATION_RESOURCE,
      operation: 'inviteMember',
      input: { email, role: 'admin' },
    } as never);
    const created = (await provider.mutations?.custom?.(invite as never, context())) as {
      invitation_id: string;
      token: string;
    };
    expect(created.token.length).toBeGreaterThan(20);

    const read = createQueryDescriptor({
      ...IDENTITY,
      kind: 'one',
      ref: ref(INVITATION_RESOURCE),
      resource: INVITATION_RESOURCE,
      id: created.invitation_id,
    } as never);
    const row = (await provider.queries?.one?.(read as never, context())) as {
      data: Record<string, unknown>;
    };
    expect(row.data).toMatchObject({ email, status: 'pending', role: 'admin' });

    // The revoke flow's write: pending -> revoked is the one update org_admin may make.
    const revoke = createMutationDescriptor({
      ...IDENTITY,
      kind: 'updateOne',
      ref: ref(INVITATION_RESOURCE),
      resource: INVITATION_RESOURCE,
      idField: 'id',
      id: created.invitation_id,
      input: { status: 'revoked' },
    } as never);
    const revoked = await provider.mutations?.updateOne?.(revoke as never, context());
    expect(revoked).toMatchObject({ record: { status: 'revoked' } });
  });
});
