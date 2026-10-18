import { describe, expect, it } from 'vitest';
import type { TableSpec } from '../metadata-src/types.js';
import { buildTableMetadata } from './build-table-metadata.js';

const ORG_FILTER = { organization_id: { _eq: 'X-Hasura-Organization-Id' } };

describe('buildTableMetadata: identity', () => {
  it('should set table, custom_name and is_enum without permissions for enums', () => {
    const md = buildTableMetadata({ name: 'statuses', isEnum: true, profile: 'none' }, ['value', 'comment'], [], []);
    expect(md.table).toEqual({ schema: 'itap', name: 'statuses' });
    expect(md.configuration).toEqual({ custom_name: 'statuses' });
    expect(md.is_enum).toBe(true);
    expect(md.select_permissions).toBeUndefined();
    expect(md.insert_permissions).toBeUndefined();
    expect(md.update_permissions).toBeUndefined();
    expect(md.delete_permissions).toBeUndefined();
  });

  it('should throw when an enum table has a profile other than none', () => {
    expect(() =>
      buildTableMetadata({ name: 'statuses', isEnum: true, profile: 'tenant_crud' }, ['value'], [], []),
    ).toThrow(/isEnum.*profile 'none'/);
  });

  it('should use the itap_results schema when given', () => {
    const md = buildTableMetadata({ name: 'detections', schema: 'itap_results', profile: 'none' }, ['id'], [], []);
    expect(md.table).toEqual({ schema: 'itap_results', name: 'detections' });
    expect(md.is_enum).toBeUndefined();
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

  it('should drop the insert permission with noInsert', () => {
    const md = buildTableMetadata({ name: 'things', profile: 'tenant_crud', noInsert: true }, columns, [], []);
    expect(md.insert_permissions).toBeUndefined();
    expect(md.update_permissions).toHaveLength(1);
    expect(md.delete_permissions).toHaveLength(1);
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
    const adminSelect = { role: 'org_admin', permission: { columns: ['id'], filter: {}, allow_aggregations: false } };
    const md = buildTableMetadata(
      { name: 'things', profile: 'tenant_crud', extraPermissions: { select_permissions: [userSelect, adminSelect] } },
      columns,
      [],
      [],
    );
    expect(md.select_permissions).toEqual([
      adminSelect,
      { role: 'user', permission: { ...userSelect.permission, allow_aggregations: true } },
    ]);
  });

  it('should exclude generated and identity-always columns from insert/update', () => {
    const md = buildTableMetadata(
      { name: 'things', profile: 'tenant_crud' },
      ['id', 'organization_id', 'name', 'search_text', 'seq'],
      [],
      [],
      ['search_text', 'seq'],
    );
    expect(md.insert_permissions?.[0].permission.columns).toEqual(['name']);
    expect(md.update_permissions?.[0].permission.columns).toEqual(['name']);
    expect(md.select_permissions?.[0].permission.columns).toContain('search_text');
  });

  it('should keep insertOnlyColumns insertable but not updatable', () => {
    const md = buildTableMetadata(
      { name: 'things', profile: 'tenant_crud', insertOnlyColumns: ['user_id'] },
      ['id', 'organization_id', 'name', 'user_id'],
      [],
      [],
    );
    expect(md.insert_permissions?.[0].permission.columns).toEqual(['name', 'user_id']);
    expect(md.update_permissions?.[0].permission.columns).toEqual(['name']);
    expect(md.select_permissions?.[0].permission.columns).toContain('user_id');
  });

  it('should throw for an unknown insertOnlyColumns entry', () => {
    expect(() =>
      buildTableMetadata(
        { name: 'things', profile: 'tenant_crud', insertOnlyColumns: ['nope'] },
        ['id', 'organization_id'],
        [],
        [],
      ),
    ).toThrow(/unknown column "nope"/);
  });
});
