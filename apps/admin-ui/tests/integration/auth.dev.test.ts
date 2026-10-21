import type { AuthContext } from '@burojs/core';
import { describe, expect, it } from 'vitest';
import { createItapAuthProvider } from '../../src/auth/auth-provider';
import { createNhostClient } from '../../src/auth/nhost-client';
import { createOrgClient } from '../../src/auth/org-client';
import { createTokenStore } from '../../src/auth/token-store';

import { ADMIN_EMAIL, DEV_AUTH, DEV_GRAPHQL as GRAPHQL, DEV_STACK_ENABLED as enabled, seedPassword } from '../support/dev-hosts';

async function organizationsFor(token: string): Promise<string[]> {
  const response = await fetch(GRAPHQL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: '{ organizations { id } }' }),
  });
  const body = (await response.json()) as { data?: { organizations: { id: string }[] }; errors?: unknown };
  expect(body.errors).toBeUndefined();
  return (body.data?.organizations ?? []).map((o) => o.id);
}

describe.skipIf(!enabled)('auth against the dev stack', () => {
  it('signs in, lists two memberships and scopes each organization token', async () => {
    const password = seedPassword();
    const store = createTokenStore(undefined);
    const provider = createItapAuthProvider({
      store,
      nhost: createNhostClient({ baseUrl: DEV_AUTH }),
      org: createOrgClient({ endpoint: GRAPHQL }),
    });
    const ctx = {} as AuthContext;

    const result = await provider.login?.({ email: ADMIN_EMAIL, password }, ctx);
    expect(result).toEqual({ success: true });
    const identity = await provider.getIdentity(ctx);
    expect(identity?.memberships).toHaveLength(2);

    for (const membership of identity?.memberships ?? []) {
      expect(await provider.switchOrganization(membership.organizationId)).toEqual({ success: true });
      const token = await provider.getToken();
      expect(token).toBeTruthy();
      expect(await organizationsFor(token ?? '')).toEqual([membership.organizationId]);
    }
    await provider.logout?.(undefined, ctx);
  });
});
