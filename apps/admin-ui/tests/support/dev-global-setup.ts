import type { AuthContext } from '@burojs/core';
import type { TestProject } from 'vitest/node';
import { createItapAuthProvider } from '../../src/auth/auth-provider';
import { createNhostClient } from '../../src/auth/nhost-client';
import { createOrgClient } from '../../src/auth/org-client';
import { createTokenStore } from '../../src/auth/token-store';
import { DEV_AUTH, DEV_GRAPHQL, seedPassword } from './dev-hosts';
import { DEV_SESSION_LOGINS, type DevSessions, sessionKey } from './dev-sessions';

/**
 * Vitest global setup, active only with `ITAP_DEV_STACK=1` (see `vitest.config.ts`). hasura-auth
 * allows ten sign-ins per five minutes, so the run signs each account in once here and hands the
 * token snapshots to the test files (`inject('devSessions')`, read by `signInDev`). Each
 * organization snapshot comes from `switch_organization`, which needs no new sign-in.
 */
export default async function setup(project: TestProject): Promise<void> {
  const sessions: DevSessions = {};
  const byEmail = new Map<string, ReturnType<typeof createItapAuthProvider>>();
  const stores = new Map<string, ReturnType<typeof createTokenStore>>();
  for (const [email, organizationName] of DEV_SESSION_LOGINS) {
    let provider = byEmail.get(email);
    let store = stores.get(email);
    if (provider === undefined || store === undefined) {
      store = createTokenStore(undefined);
      provider = createItapAuthProvider({
        store,
        nhost: createNhostClient({ baseUrl: DEV_AUTH }),
        org: createOrgClient({ endpoint: DEV_GRAPHQL }),
      });
      const result = await provider.login?.({ email, password: seedPassword() }, {} as AuthContext);
      if (!result?.success) throw new Error(`Dev-stack sign-in for ${email} failed: ${JSON.stringify(result)}`);
      byEmail.set(email, provider);
      stores.set(email, store);
    }
    if (organizationName !== undefined) {
      const identity = await provider.getIdentity({} as AuthContext);
      const membership = identity?.memberships.find((m) => m.name === organizationName);
      if (!membership) throw new Error(`${email} has no membership named ${organizationName}`);
      const switched = await provider.switchOrganization(membership.organizationId);
      if (!switched.success) throw new Error(`Switch to ${organizationName} failed: ${JSON.stringify(switched)}`);
    }
    sessions[sessionKey(email, organizationName)] = store.snapshot();
  }
  project.provide('devSessions', sessions);
}
