import type { TableSpec } from './types.js';

export const companyTables: TableSpec[] = [
  { name: 'company_kinds', isEnum: true, profile: 'none' },
  { name: 'company_statuses', isEnum: true, profile: 'none' },
  // Internal counters behind itap.assign_number(); never exposed through GraphQL permissions.
  { name: 'organization_counters', profile: 'none' },
  { name: 'companies', profile: 'tenant_crud' },
  { name: 'work_schedules', profile: 'tenant_crud' },
];
