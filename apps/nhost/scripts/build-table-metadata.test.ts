import { describe, expect, it } from 'vitest';
import type { ForeignKey, TableSpec } from '../metadata-src/types.js';
import { buildTableMetadata } from './build-table-metadata.js';

const ORG_FILTER = { organization_id: { _eq: 'X-Hasura-Organization-Id' } };

const orgFk = (table: string): ForeignKey => ({
  table,
  columns: ['organization_id'],
  refTable: 'organizations',
  refColumns: ['id'],
  constraint: `${table}_organization_id_fkey`,
});

describe('buildTableMetadata: identity', () => {
  it('should set table, custom_name and is_enum without permissions for enums', () => {
    const md = buildTableMetadata(
      { name: 'statuses', isEnum: true, profile: 'tenant_crud' },
      ['value', 'comment'],
      [],
      [],
    );
    expect(md.table).toEqual({ schema: 'itap', name: 'statuses' });
    expect(md.configuration).toEqual({ custom_name: 'statuses' });
    expect(md.is_enum).toBe(true);
    expect(md.select_permissions).toBeUndefined();
    expect(md.insert_permissions).toBeUndefined();
    expect(md.update_permissions).toBeUndefined();
    expect(md.delete_permissions).toBeUndefined();
  });

  it('should use the itap_results schema when given', () => {
    const md = buildTableMetadata({ name: 'detections', schema: 'itap_results', profile: 'none' }, ['id'], [], []);
    expect(md.table).toEqual({ schema: 'itap_results', name: 'detections' });
    expect(md.is_enum).toBeUndefined();
  });
});

describe('buildTableMetadata: object relationships', () => {
  it('should map a composite FK over all columns and name it after the non-org column', () => {
    const fk: ForeignKey = {
      table: 'identities',
      columns: ['organization_id', 'profile_id'],
      refTable: 'profiles',
      refColumns: ['organization_id', 'id'],
      constraint: 'identities_profile_fkey',
    };
    const md = buildTableMetadata(
      { name: 'identities', profile: 'none' },
      ['id', 'organization_id', 'profile_id'],
      [fk, orgFk('identities')],
      [],
    );
    expect(md.object_relationships).toEqual([
      {
        name: 'organization',
        using: {
          manual_configuration: {
            remote_table: { schema: 'itap', name: 'organizations' },
            column_mapping: { organization_id: 'id' },
          },
        },
      },
      {
        name: 'profile',
        using: {
          manual_configuration: {
            remote_table: { schema: 'itap', name: 'profiles' },
            column_mapping: { organization_id: 'organization_id', profile_id: 'id' },
          },
        },
      },
    ]);
  });

  it('should apply relationshipNames overrides by constraint', () => {
    const fk: ForeignKey = {
      table: 'incidents',
      columns: ['organization_id', 'assigned_to'],
      refTable: 'organization_members',
      refColumns: ['organization_id', 'id'],
      constraint: 'incidents_assigned_to_fkey',
    };
    const md = buildTableMetadata(
      { name: 'incidents', profile: 'none', relationshipNames: { incidents_assigned_to_fkey: 'assignee' } },
      ['id', 'organization_id', 'assigned_to'],
      [fk],
      [],
    );
    expect(md.object_relationships?.map((r) => r.name)).toEqual(['assignee']);
  });

  it('should throw when a derived relationship name collides with a column', () => {
    const fk: ForeignKey = {
      table: 'incidents',
      columns: ['organization_id', 'assigned_to'],
      refTable: 'organization_members',
      refColumns: ['organization_id', 'id'],
      constraint: 'incidents_assigned_to_fkey',
    };
    expect(() =>
      buildTableMetadata({ name: 'incidents', profile: 'none' }, ['id', 'organization_id', 'assigned_to'], [fk], []),
    ).toThrow(/incidents_assigned_to_fkey.*relationshipNames/);
  });
});

describe('buildTableMetadata: array relationships', () => {
  const memberFk = (col: string): ForeignKey => ({
    table: 'incidents',
    columns: ['organization_id', col],
    refTable: 'organization_members',
    refColumns: ['organization_id', 'id'],
    constraint: `incidents_${col}_fkey`,
  });

  it('should name array relationships after the child, disambiguating several FKs from one child', () => {
    const notes: ForeignKey = {
      table: 'member_notes',
      columns: ['organization_id', 'member_id'],
      refTable: 'organization_members',
      refColumns: ['organization_id', 'id'],
      constraint: 'member_notes_member_fkey',
    };
    const md = buildTableMetadata(
      { name: 'organization_members', profile: 'none' },
      ['id', 'organization_id'],
      [],
      [memberFk('assigned_to'), memberFk('acknowledged_by'), notes],
    );
    expect(md.array_relationships).toEqual([
      {
        name: 'incidents_by_acknowledged_by',
        using: {
          manual_configuration: {
            remote_table: { schema: 'itap', name: 'incidents' },
            column_mapping: { organization_id: 'organization_id', id: 'acknowledged_by' },
          },
        },
      },
      {
        name: 'incidents_by_assigned_to',
        using: {
          manual_configuration: {
            remote_table: { schema: 'itap', name: 'incidents' },
            column_mapping: { organization_id: 'organization_id', id: 'assigned_to' },
          },
        },
      },
      {
        name: 'member_notes',
        using: {
          manual_configuration: {
            remote_table: { schema: 'itap', name: 'member_notes' },
            column_mapping: { organization_id: 'organization_id', id: 'member_id' },
          },
        },
      },
    ]);
  });

  it('should apply relationshipNames to incoming FKs', () => {
    const md = buildTableMetadata(
      {
        name: 'organizations',
        profile: 'none',
        relationshipNames: { organization_members_organization_id_fkey: 'members' },
      },
      ['id', 'name'],
      [],
      [orgFk('organization_members')],
    );
    expect(md.array_relationships?.map((r) => r.name)).toEqual(['members']);
  });
});

describe('buildTableMetadata: self references', () => {
  it('should let "#array" override only the array end of a self-referencing FK', () => {
    const fk: ForeignKey = {
      table: 'areas',
      columns: ['organization_id', 'parent_id'],
      refTable: 'areas',
      refColumns: ['organization_id', 'id'],
      constraint: 'areas_parent_fkey',
    };
    const md = buildTableMetadata(
      { name: 'areas', profile: 'none', relationshipNames: { 'areas_parent_fkey#array': 'children' } },
      ['id', 'organization_id', 'parent_id'],
      [fk],
      [fk],
    );
    expect(md.object_relationships?.map((r) => r.name)).toEqual(['parent']);
    expect(md.array_relationships?.map((r) => r.name)).toEqual(['children']);
  });
});

describe('buildTableMetadata: permission profiles', () => {
  const columns = [
    'id',
    'organization_id',
    'name',
    'password',
    'member_count',
    'created_at',
    'updated_at',
    'created_by',
  ];

  it('should build org_admin select/insert/update/delete for tenant_crud', () => {
    const spec: TableSpec = {
      name: 'things',
      profile: 'tenant_crud',
      secretColumns: ['password'],
      readOnlyColumns: ['member_count'],
    };
    const md = buildTableMetadata(spec, columns, [], []);
    expect(md.select_permissions).toEqual([
      {
        role: 'org_admin',
        permission: {
          columns: ['created_at', 'created_by', 'id', 'member_count', 'name', 'organization_id', 'updated_at'],
          filter: ORG_FILTER,
          allow_aggregations: true,
        },
      },
    ]);
    expect(md.insert_permissions).toEqual([
      {
        role: 'org_admin',
        permission: {
          columns: ['name', 'password'],
          check: ORG_FILTER,
          set: { organization_id: 'x-hasura-organization-id', created_by: 'x-hasura-user-id' },
        },
      },
    ]);
    expect(md.update_permissions).toEqual([
      { role: 'org_admin', permission: { columns: ['name', 'password'], filter: ORG_FILTER } },
    ]);
    expect(md.delete_permissions).toEqual([{ role: 'org_admin', permission: { filter: ORG_FILTER } }]);
  });

  it('should omit the created_by preset when the column is absent', () => {
    const md = buildTableMetadata(
      { name: 'things', profile: 'tenant_crud' },
      ['id', 'organization_id', 'name'],
      [],
      [],
    );
    expect(md.insert_permissions?.[0].permission.set).toEqual({ organization_id: 'x-hasura-organization-id' });
  });

  it('should drop the delete permission with noDelete', () => {
    const md = buildTableMetadata({ name: 'things', profile: 'tenant_crud', noDelete: true }, columns, [], []);
    expect(md.delete_permissions).toBeUndefined();
    expect(md.update_permissions).toHaveLength(1);
  });

  it('should build select only for tenant_read', () => {
    const md = buildTableMetadata({ name: 'things', profile: 'tenant_read' }, columns, [], []);
    expect(md.select_permissions).toHaveLength(1);
    expect(md.insert_permissions).toBeUndefined();
    expect(md.update_permissions).toBeUndefined();
    expect(md.delete_permissions).toBeUndefined();
  });

  it('should build no permissions for none', () => {
    const md = buildTableMetadata({ name: 'things', profile: 'none' }, columns, [], []);
    expect(md.select_permissions).toBeUndefined();
  });

  it('should throw for a tenant profile on a table without organization_id', () => {
    expect(() => buildTableMetadata({ name: 'things', profile: 'tenant_read' }, ['id'], [], [])).toThrow(
      /organization_id/,
    );
  });

  it('should merge extraPermissions last, replacing same-role entries and sorting by role', () => {
    const userSelect = { role: 'user', permission: { columns: ['id'], filter: { id: { _eq: 'X-Hasura-User-Id' } } } };
    const adminSelect = { role: 'org_admin', permission: { columns: ['id'], filter: {} } };
    const md = buildTableMetadata(
      { name: 'things', profile: 'tenant_crud', extraPermissions: { select_permissions: [userSelect, adminSelect] } },
      columns,
      [],
      [],
    );
    expect(md.select_permissions).toEqual([adminSelect, userSelect]);
  });
});
