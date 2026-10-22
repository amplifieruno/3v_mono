import type { DataProvider } from '@burojs/core';
import { createHasuraDataProvider } from '@burojs/hasura';
import { ACTION_REFUSALS, HASURA_OPERATIONS, ITAP_TABLES } from '../modules';
import { withActionRefusals } from './action-refusals';
import { GRAPHQL_ENDPOINT } from './endpoints';

export { HASURA_PROVIDER } from './provider-name';

/**
 * The console's one data provider over every module's mappings and custom
 * operations (`../modules/index.ts`). `getToken` returns the current
 * organization token per request; no role header is sent (`defaultRole:
 * null`), so the role comes from the token (`org_admin`). Organization
 * isolation is the token's job, never a client-side filter. `endpoint`
 * defaults to the dev proxy path; the dev-stack tests pass Hasura's absolute URL. The actions'
 * definite refusals read as form issues (`withActionRefusals`).
 */
export function createItapHasuraProvider(
  getToken: () => Promise<string | null>,
  endpoint: string = GRAPHQL_ENDPOINT,
): DataProvider {
  const provider = createHasuraDataProvider({
    getToken,
    endpoint,
    defaultRole: null,
    resources: { ...ITAP_TABLES },
    operations: HASURA_OPERATIONS,
  });
  return withActionRefusals(provider, ACTION_REFUSALS);
}
