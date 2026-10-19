import type { FunctionSpec, TableSpec } from './types.js';

/** Housekeeping of Hasura's own trigger logs (cron purge_trigger_logs). */
export const maintenanceTables: TableSpec[] = [
  // Row type of itap.purge_trigger_logs (catalog table name, rows deleted); stores nothing, no role can select it.
  { name: 'trigger_log_purges', schema: 'itap_results', profile: 'none' },
];

export const maintenanceFunctions: FunctionSpec[] = [
  {
    name: 'purge_trigger_logs',
    exposedAs: 'mutation',
    roles: [],
    unscopedReturnReason: 'admin-only: Hasura catalog housekeeping, called by the purge_trigger_logs cron handler',
  },
];
