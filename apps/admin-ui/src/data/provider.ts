import type { DataProvider } from '@burojs/core';
import { createHasuraDataProvider, hasuraCapabilities } from '@burojs/hasura';
import { ACTION_REFUSALS, HASURA_OPERATIONS, ITAP_TABLES } from '../modules';
import { withActionRefusals } from './action-refusals';
import { GRAPHQL_ENDPOINT } from './endpoints';

export { HASURA_PROVIDER } from './provider-name';

/** What the provider and its capability record are built from. */
const HASURA_CONFIG = {
  defaultRole: null,
  resources: { ...ITAP_TABLES },
  operations: HASURA_OPERATIONS,
};

/** The provider's static capability record, stamped on its registration (`../app/app-definition.ts`). */
export const itapHasuraCapabilities = hasuraCapabilities(HASURA_CONFIG);

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
  const provider = createHasuraDataProvider({ ...HASURA_CONFIG, getToken, endpoint });
  return withActionRefusals(provider, ACTION_REFUSALS);
}
