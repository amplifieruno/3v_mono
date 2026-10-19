import type { FunctionSpec, TableSpec } from './types.js';

/** Visits (spec §6.2). */
export const visitTables: TableSpec[] = [
  { name: 'visit_statuses', isEnum: true, profile: 'none' },
  {
    // History: cancelled / no_show instead of deletion. Status and check-in/out columns change only through
    // check_in_visit / check_out_visit / cancel_visit and the lifecycle cron.
    name: 'visits',
    profile: 'tenant_crud',
    noDelete: true,
    readOnlyColumns: ['number', 'status', 'checked_in_at', 'checked_out_at', 'cancellation_reason'],
  },
];

export const visitFunctions: FunctionSpec[] = ['check_in_visit', 'check_out_visit', 'cancel_visit'].map(
  (name): FunctionSpec => ({ name, exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: ['org_admin'] }),
);
