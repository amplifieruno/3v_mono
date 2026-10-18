import { auditTables } from './audit.js';
import { tenancyTables } from './tenancy.js';
import type { TableSpec } from './types.js';

/**
 * Every table in schemas `itap` / `itap_results` must have exactly one spec here.
 * Run `pnpm --filter nhost metadata:generate` after changing this list or the DB schema.
 */
export const tables: TableSpec[] = [...tenancyTables, ...auditTables];
