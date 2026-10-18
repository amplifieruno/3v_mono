import type { TableSpec } from './types.js';

export const auditTables: TableSpec[] = [
  { name: 'audit_actions', isEnum: true, profile: 'none' },
  // Written only by triggers / backend; org admins can read their own organization's rows.
  { name: 'audit_log', profile: 'tenant_read' },
];
