import type { BoolExp, FunctionSpec, TableSpec } from './types.js';

const ORG_ADMIN = 'org_admin';
const ownOrganizationRow: BoolExp = { organization_id: { _eq: 'X-Hasura-Organization-Id' } };

export const facilityTables: TableSpec[] = [
  { name: 'facility_statuses', isEnum: true, profile: 'none' },
  { name: 'area_types', isEnum: true, profile: 'none' },
  { name: 'area_access_levels', isEnum: true, profile: 'none' },
  { name: 'area_statuses', isEnum: true, profile: 'none' },
  {
    // Lifecycle by status (spec §6.0): delete succeeds only while nothing references the facility (NO ACTION FKs).
    name: 'facilities',
    profile: 'tenant_crud',
    readOnlyColumns: ['number'],
    computedFields: [{ name: 'areas_count', function: 'facility_areas_count' }],
  },
  {
    // path/depth are maintained by trigger (areas_maintain_path); moving an area to another facility is not
    // supported (children and devices are bound to the facility by composite FKs).
    name: 'areas',
    profile: 'tenant_crud',
    readOnlyColumns: ['path', 'depth'],
    insertOnlyColumns: ['facility_id'],
    computedFields: [{ name: 'current_occupancy', function: 'area_current_occupancy' }],
    relationshipNames: {
      'areas_parent_fkey#array': 'children',
      floor_plans_area_fkey: 'floor_plan',
    },
  },
  { name: 'floor_plans', profile: 'tenant_crud', insertOnlyColumns: ['facility_id'] },
  {
    // Row type of itap.area_descendants; stores nothing. Root fields hidden: rows are reachable through the function.
    name: 'area_refs',
    schema: 'itap_results',
    profile: 'tenant_read',
    extraPermissions: {
      select_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: ['access_level', 'area_type', 'depth', 'facility_id', 'id', 'name', 'organization_id', 'parent_id', 'status'],
            filter: ownOrganizationRow,
            query_root_fields: [],
            subscription_root_fields: [],
          },
        },
      ],
    },
  },
];

export const facilityFunctions: FunctionSpec[] = [
  { name: 'area_descendants', exposedAs: 'query', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] },
];
