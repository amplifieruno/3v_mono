import { AUTH_BASE, GRAPHQL_ENDPOINT } from '../data/endpoints';
import { createItapAuthProvider } from './auth-provider';
import { createNhostClient } from './nhost-client';
import { createOrgClient } from './org-client';
import { createTokenStore } from './token-store';

/**
 * The browser session, one per page: the persisted token store and the auth
 * provider over it. The data provider reads its organization token from here.
 */
export const tokenStore = createTokenStore();

export const authProvider = createItapAuthProvider({
  store: tokenStore,
  nhost: createNhostClient({ baseUrl: AUTH_BASE }),
  org: createOrgClient({ endpoint: GRAPHQL_ENDPOINT }),
});
