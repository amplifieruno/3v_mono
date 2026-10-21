import type { DataProvider } from '@burojs/core';
import { createHasuraDataProvider } from '@burojs/hasura';
import { GRAPHQL_ENDPOINT } from './endpoints';
import { ITAP_TABLES } from './mapping';
import { HASURA_OPERATIONS } from './operations';

/** The provider name resources bind to (`data: { provider: 'hasura' }`). */
export const HASURA_PROVIDER = 'hasura';

/**
 * The console's one data provider. `getToken` returns the current organization
 * token per request; no role header is sent (`defaultRole: null`), so the role
 * comes from the token (`org_admin`). Organization isolation is the token's
 * job, never a client-side filter. `endpoint` defaults to the dev proxy path;
 * the dev-stack tests pass Hasura's absolute URL.
 */
export function createItapHasuraProvider(
  getToken: () => Promise<string | null>,
  endpoint: string = GRAPHQL_ENDPOINT,
): DataProvider {
  return createHasuraDataProvider({
    getToken,
    endpoint,
    defaultRole: null,
    resources: ITAP_TABLES,
    operations: HASURA_OPERATIONS,
  });
}
