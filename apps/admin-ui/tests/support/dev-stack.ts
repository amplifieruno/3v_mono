import type { AuthContext } from '@burojs/core';
import { expect } from 'vitest';
import { type ItapAuthProvider, createItapAuthProvider } from '../../src/auth/auth-provider';
import { createNhostClient } from '../../src/auth/nhost-client';
import { createOrgClient } from '../../src/auth/org-client';
import { createTokenStore } from '../../src/auth/token-store';
import { DEV_AUTH, DEV_GRAPHQL, seedPassword } from './dev-hosts';

export { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, DEV_STORAGE, NOVA_NAME } from './dev-hosts';

/**
 * Shared by the dev-stack tests (`tests/integration/*.dev.test.ts`): they run
 * only with `ITAP_DEV_STACK=1` and read the seed password from `SEED_PASSWORD`
 * (hosts and seed constants: `./dev-hosts.ts`). The dev auth service
 * rate-limits sign-ins, so each file signs in once.
 */

/**
 * Signs a seed account in through the console's own auth provider and, when
 * `organizationName` is given, switches into that membership. Fails the test
 * when the sign-in or the switch is refused.
 */
export async function signInDev(
  email: string,
  organizationName?: string,
): Promise<ItapAuthProvider> {
  const password = seedPassword();
  const provider = createItapAuthProvider({
    store: createTokenStore(undefined),
    nhost: createNhostClient({ baseUrl: DEV_AUTH }),
    org: createOrgClient({ endpoint: DEV_GRAPHQL }),
  });
  const result = await provider.login?.({ email, password }, {} as AuthContext);
  expect(result).toEqual({ success: true });
  if (organizationName !== undefined) {
    const identity = await provider.getIdentity({} as AuthContext);
    const membership = identity?.memberships.find((m) => m.name === organizationName);
    expect(membership, `no membership named ${organizationName}`).toBeDefined();
    expect(await provider.switchOrganization(membership?.organizationId ?? '')).toEqual({
      success: true,
    });
  }
  return provider;
}
