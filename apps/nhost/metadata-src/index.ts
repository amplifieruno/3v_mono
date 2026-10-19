import { auditTables } from './audit.js';
import { companyTables } from './companies.js';
import { facilityFunctions, facilityTables } from './facilities.js';
import { identityFunctions, identityTables } from './identities.js';
import { profileFunctions, profileTables } from './profiles.js';
import { tenancyFunctions, tenancyTables } from './tenancy.js';
import type { FunctionSpec, TableSpec } from './types.js';

/**
 * Every table in schemas `itap` / `itap_results` must have exactly one spec here.
 * Run `pnpm --filter nhost metadata:generate` after changing this list or the DB schema.
 */
export const tables: TableSpec[] = [
  ...tenancyTables,
  ...auditTables,
  ...companyTables,
  ...profileTables,
  ...identityTables,
  ...facilityTables,
];

/** Every tracked SQL function (functions.yaml is generated from this list; untracked functions are internal). */
export const functions: FunctionSpec[] = [
  ...tenancyFunctions,
  ...identityFunctions,
  ...profileFunctions,
  ...facilityFunctions,
];
