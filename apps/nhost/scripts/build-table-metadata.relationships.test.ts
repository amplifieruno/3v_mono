import { describe, expect, it } from 'vitest';
import type { ForeignKey } from '../metadata-src/types.js';
import { buildTableMetadata } from './build-table-metadata.js';

const orgFk = (table: string): ForeignKey => ({
  table,
  columns: ['organization_id'],
  refTable: 'organizations',
  refColumns: ['id'],
  constraint: `${table}_organization_id_fkey`,
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
      buildTableMetadata(
        { name: 'incidents', profile: 'none' },
        ['id', 'organization_id', 'assigned_to', 'assigned_to_member'],
        [fk],
        [],
      ),
    ).toThrow(/incidents_assigned_to_fkey.*relationshipNames/);
  });

  it('should name FK columns without _id as <col>_<singular of last referenced-table segment>', () => {
    const memberFk = (col: string): ForeignKey => ({
      table: 'incidents',
      columns: ['organization_id', col],
      refTable: 'organization_members',
      refColumns: ['organization_id', 'id'],
      constraint: `incidents_${col}_fkey`,
    });
    const fks = [memberFk('assigned_to'), memberFk('created_by')];
    const child = buildTableMetadata(
      { name: 'incidents', profile: 'none' },
      ['id', 'organization_id', 'assigned_to', 'created_by'],
      fks,
      [],
    );
    expect(child.object_relationships?.map((r) => r.name)).toEqual(['assigned_to_member', 'created_by_member']);
    const parent = buildTableMetadata(
      { name: 'organization_members', profile: 'none' },
      ['id', 'organization_id'],
      [],
      fks,
    );
    expect(parent.array_relationships?.map((r) => r.name)).toEqual([
      'incidents_by_assigned_to',
      'incidents_by_created_by',
    ]);
  });

  it('should singularize common plural forms of the referenced table', () => {
    const fk = (col: string, refTable: string): ForeignKey => ({
      table: 't',
      columns: [col],
      refTable,
      refColumns: ['id'],
      constraint: `t_${col}_fkey`,
    });
    const md = buildTableMetadata(
      { name: 't', profile: 'none' },
      ['a', 'b', 'c', 'd', 'e'],
      [fk('a', 'identities'), fk('b', 'case_statuses'), fk('c', 'addresses'), fk('d', 'cases'), fk('e', 'boxes')],
      [],
    );
    expect(md.object_relationships?.map((r) => r.name)).toEqual([
      'a_identity',
      'b_status',
      'c_address',
      'd_case',
      'e_box',
    ]);
  });

  it('should emit only the object end for FKs into auth.users and storage.files', () => {
    const userFk: ForeignKey = {
      table: 'organization_members',
      columns: ['user_id'],
      refSchema: 'auth',
      refTable: 'users',
      refColumns: ['id'],
      constraint: 'organization_members_user_id_fkey',
    };
    const fileFk: ForeignKey = {
      table: 'organization_members',
      columns: ['primary_photo_file_id'],
      refSchema: 'storage',
      refTable: 'files',
      refColumns: ['id'],
      constraint: 'organization_members_photo_fkey',
    };
    const md = buildTableMetadata(
      { name: 'organization_members', profile: 'none' },
      ['id', 'organization_id', 'user_id', 'primary_photo_file_id'],
      [userFk, fileFk],
      [],
    );
    expect(md.object_relationships).toEqual([
      {
        name: 'primary_photo_file',
        using: {
          manual_configuration: {
            remote_table: { schema: 'storage', name: 'files' },
            column_mapping: { primary_photo_file_id: 'id' },
          },
        },
      },
      {
        name: 'user',
        using: {
          manual_configuration: {
            remote_table: { schema: 'auth', name: 'users' },
            column_mapping: { user_id: 'id' },
          },
        },
      },
    ]);
  });

  it('should throw on relationshipNames keys that match no constraint', () => {
    const run = (key: string) => () =>
      buildTableMetadata(
        { name: 'notes', profile: 'none', relationshipNames: { [key]: 'x' } },
        ['id', 'organization_id'],
        [orgFk('notes')],
        [],
      );
    expect(run('notes_organization_id_fkey')).not.toThrow();
    expect(run('notes_typo_fkey')).toThrow(/unknown constraint "notes_typo_fkey"/);
    expect(run('notes_organization_id_fkey#array')).toThrow(/unknown constraint "notes_organization_id_fkey#array"/);
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
