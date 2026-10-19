import type { BoolExp, FunctionSpec, TableSpec } from './types.js';

const ownOrganizationRow: BoolExp = { organization_id: { _eq: 'X-Hasura-Organization-Id' } };

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
    extraPermissions: {
      // Only a scheduled visit can be edited; afterwards it is history.
      update_permissions: [
        {
          role: 'org_admin',
          permission: {
            columns: [
              'badge_number',
              'company_id',
              'expected_end',
              'expected_start',
              'facility_id',
              'host_profile_id',
              'purpose',
              'visitor_profile_id',
            ],
            filter: { _and: [ownOrganizationRow, { status: { _eq: 'scheduled' } }] },
            check: ownOrganizationRow,
          },
        },
      ],
    },
  },
];

export const visitFunctions: FunctionSpec[] = ['check_in_visit', 'check_out_visit', 'cancel_visit'].map(
  (name): FunctionSpec => ({ name, exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: ['org_admin'] }),
);
