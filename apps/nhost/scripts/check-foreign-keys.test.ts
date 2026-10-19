import { describe, expect, it } from 'vitest';
import type { ForeignKey } from '../metadata-src/types.js';
import { assertTenantForeignKeys, markOneToOne } from './check-foreign-keys.js';
import type { IndexRow, Introspection } from './plan-metadata.js';

const cols = (table: string, ...columns: string[]) => columns.map((column) => ({ schema: 'itap' as const, table, column }));
const index = (table: string, columns: string[], unique = false): IndexRow => ({
  schema: 'itap',
  table,
  name: `${table}_${columns.join('_')}_idx`,
  columns,
  unique,
});

const profileFk = (columns: string[], refColumns: string[]): ForeignKey => ({
  schema: 'itap',
  table: 'identities',
  columns,
  refSchema: 'itap',
  refTable: 'profiles',
  refColumns,
  constraint: 'identities_profile_id_fkey',
});

function intro(foreignKeys: ForeignKey[], indexes: IndexRow[]): Introspection {
  return {
    columns: [
      ...cols('organizations', 'id'),
      ...cols('profiles', 'id', 'organization_id'),
      ...cols('identities', 'id', 'organization_id', 'profile_id'),
      ...cols('user_settings', 'user_id', 'last_organization_id'),
    ],
    foreignKeys,
    indexes,
  };
}

describe('assertTenantForeignKeys: composite FK rule', () => {
  it('should reject a single-column FK between two tenant tables, naming the constraint', () => {
    const fk = profileFk(['profile_id'], ['id']);
    expect(() => assertTenantForeignKeys(intro([fk], [index('identities', ['organization_id', 'profile_id'])]))).toThrow(
      /identities_profile_id_fkey \(itap\.identities -> itap\.profiles\): both tables have organization_id/,
    );
  });

  it('should reject a composite FK that does not map organization_id onto organization_id', () => {
    const fk = profileFk(['organization_id', 'profile_id'], ['id', 'organization_id']);
    expect(() => assertTenantForeignKeys(intro([fk], [index('identities', ['organization_id', 'profile_id'])]))).toThrow(
      /identities_profile_id_fkey/,
    );
  });

  it('should accept a composite (organization_id, profile_id) -> (organization_id, id) FK with its index', () => {
    const fk = profileFk(['organization_id', 'profile_id'], ['organization_id', 'id']);
    expect(() =>
      assertTenantForeignKeys(intro([fk], [index('identities', ['organization_id', 'profile_id', 'id'])])),
    ).not.toThrow();
  });

  it('should not require organization_id for an FK into a table without it', () => {
    const fk: ForeignKey = {
      table: 'identities',
      columns: ['organization_id'],
      refTable: 'organizations',
      refColumns: ['id'],
      constraint: 'identities_organization_id_fkey',
    };
    expect(() => assertTenantForeignKeys(intro([fk], [index('identities', ['organization_id', 'id'])]))).not.toThrow();
  });
});

describe('assertTenantForeignKeys: FK index rule', () => {
  const fk = profileFk(['organization_id', 'profile_id'], ['organization_id', 'id']);

  it('should reject an FK without an index, naming the constraint and the required columns', () => {
    expect(() => assertTenantForeignKeys(intro([fk], []))).toThrow(
      /identities_profile_id_fkey \(itap\.identities\): no index leading with \(organization_id, profile_id\)/,
    );
  });

  it('should reject an index that does not lead with organization_id + the FK columns', () => {
    const wrong = [index('identities', ['profile_id']), index('identities', ['organization_id', 'id', 'profile_id'])];
    expect(() => assertTenantForeignKeys(intro([fk], wrong))).toThrow(/identities_profile_id_fkey/);
  });

  it('should require organization_id leading for an external FK on a tenant table', () => {
    const userFk: ForeignKey = {
      table: 'identities',
      columns: ['profile_id'],
      refSchema: 'auth',
      refTable: 'users',
      refColumns: ['id'],
      constraint: 'identities_user_fkey',
    };
    expect(() => assertTenantForeignKeys(intro([userFk], [index('identities', ['profile_id'])]))).toThrow(
      /no index leading with \(organization_id, profile_id\)/,
    );
    expect(() =>
      assertTenantForeignKeys(intro([userFk], [index('identities', ['profile_id', 'organization_id'])])),
    ).not.toThrow();
  });

  it('should accept a primary key covering the FK on a table without organization_id', () => {
    const settingsFk: ForeignKey = {
      table: 'user_settings',
      columns: ['user_id'],
      refSchema: 'auth',
      refTable: 'users',
      refColumns: ['id'],
      constraint: 'user_settings_user_id_fkey',
    };
    expect(() => assertTenantForeignKeys(intro([settingsFk], [index('user_settings', ['user_id'], true)]))).not.toThrow();
  });
});

describe('markOneToOne', () => {
  it('should mark FKs whose child columns contain a unique key, and only those', () => {
    const fk = profileFk(['organization_id', 'profile_id'], ['organization_id', 'id']);
    expect(markOneToOne(intro([fk], [index('identities', ['profile_id'], true)]))[0].oneToOne).toBe(true);
    expect(markOneToOne(intro([fk], [index('identities', ['organization_id', 'profile_id'])]))[0].oneToOne).toBeUndefined();
    expect(markOneToOne(intro([fk], [index('identities', ['id'], true)]))[0].oneToOne).toBeUndefined();
  });
});
