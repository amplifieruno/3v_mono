import type { TableSpec } from './types.js';

export const profileTables: TableSpec[] = [
  { name: 'profile_types', isEnum: true, profile: 'none' },
  { name: 'profile_statuses', isEnum: true, profile: 'none' },
  { name: 'access_levels', isEnum: true, profile: 'none' },
  { name: 'custom_attribute_entities', isEnum: true, profile: 'none' },
  { name: 'custom_attribute_types', isEnum: true, profile: 'none' },
  { name: 'custom_attribute_definitions', profile: 'tenant_crud', insertOnlyColumns: ['entity', 'key'] },
  {
    name: 'profiles',
    profile: 'tenant_crud',
    readOnlyColumns: ['number', 'identities_count', 'source_integration_id'],
    computedFields: [{ name: 'has_face', function: 'profile_has_face' }],
  },
];
