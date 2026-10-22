import type { AuthContext } from '@burojs/core';
import { expect, inject } from 'vitest';
import { type ItapAuthProvider, createItapAuthProvider } from '../../src/auth/auth-provider';
import { createNhostClient } from '../../src/auth/nhost-client';
import { createOrgClient } from '../../src/auth/org-client';
import { type TokenStore, createTokenStore } from '../../src/auth/token-store';
import { DEV_AUTH, DEV_GRAPHQL, seedPassword } from './dev-hosts';
import { type DevSessions, sessionKey } from './dev-sessions';

export { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, DEV_STORAGE, NOVA_NAME, devAdminSecret } from './dev-hosts';

/**
 * Shared by the dev-stack tests (`tests/integration/*.dev.test.ts`): they run
 * only with `ITAP_DEV_STACK=1` and read the seed password from `SEED_PASSWORD`
 * (hosts and seed constants: `./dev-hosts.ts`). The dev auth service
 * rate-limits sign-ins (ten per five minutes), so the run signs in once in the
 * global setup (`./dev-global-setup.ts`) and every file starts from those tokens.
 */

/** A base token with less than this left is refreshed (once per file) before the file uses it. */
const BASE_MARGIN_MS = 60_000;

function providerFor(store: TokenStore): ItapAuthProvider {
  return createItapAuthProvider({
    store,
    nhost: createNhostClient({ baseUrl: DEV_AUTH }),
    org: createOrgClient({ endpoint: DEV_GRAPHQL }),
  });
}

/** A fresh sign-in, for a session the global setup does not hold or one whose refresh was refused. */
async function login(email: string, organizationName?: string): Promise<ItapAuthProvider> {
  const provider = providerFor(createTokenStore(undefined));
  const result = await provider.login?.({ email, password: seedPassword() }, {} as AuthContext);
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

/**
 * A provider for a seed account in the given organization (or the one sign-in opens), built from
 * the global setup's token snapshot: no sign-in. An expired base token is refreshed once; when
 * another file rotated that refresh token first, the file signs in itself.
 */
export async function signInDev(
  email: string,
  organizationName?: string,
): Promise<ItapAuthProvider> {
  const snapshot = (inject('devSessions') as DevSessions | undefined)?.[sessionKey(email, organizationName)];
  if (snapshot?.base === undefined || snapshot.base === null) return login(email, organizationName);
  const store = createTokenStore(undefined);
  store.setBase(snapshot.base);
  store.setOrg(snapshot.org);
  if (snapshot.base.expiresAt - Date.now() < BASE_MARGIN_MS) {
    try {
      store.setBase(await createNhostClient({ baseUrl: DEV_AUTH }).refresh(snapshot.base.refreshToken));
    } catch {
      return login(email, organizationName);
    }
  }
  return providerFor(store);
}
