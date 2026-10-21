import type { DataProvider } from '@burojs/core';
import { createHasuraDataProvider } from '@burojs/hasura';
import { HASURA_OPERATIONS, ITAP_TABLES } from '../modules';
import { GRAPHQL_ENDPOINT } from './endpoints';

export { HASURA_PROVIDER } from './provider-name';

/**
 * The console's one data provider over every module's mappings and custom
 * operations (`../modules/index.ts`). `getToken` returns the current
 * organization token per request; no role header is sent (`defaultRole:
 * null`), so the role comes from the token (`org_admin`). Organization
 * isolation is the token's job, never a client-side filter. `endpoint`
 * defaults to the dev proxy path; the dev-stack tests pass Hasura's absolute URL.
 */
export function createItapHasuraProvider(
  getToken: () => Promise<string | null>,
  endpoint: string = GRAPHQL_ENDPOINT,
): DataProvider {
  return createHasuraDataProvider({
    getToken,
    endpoint,
    defaultRole: null,
    resources: { ...ITAP_TABLES },
    operations: HASURA_OPERATIONS,
  });
}
