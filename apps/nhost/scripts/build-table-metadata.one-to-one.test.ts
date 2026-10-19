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

describe('buildTableMetadata: one-to-one reverse side', () => {
  it('should emit an object (not array) relationship for a oneToOne incoming FK, renamable via #array', () => {
    const settings: ForeignKey = { ...orgFk('organization_settings'), oneToOne: true };
    const md = buildTableMetadata({ name: 'organizations', profile: 'none' }, ['id'], [], [settings, orgFk('notes')]);
    expect(md.object_relationships).toEqual([
      {
        name: 'organization_settings',
        using: {
          manual_configuration: {
            remote_table: { schema: 'itap', name: 'organization_settings' },
            column_mapping: { id: 'organization_id' },
          },
        },
      },
    ]);
    expect(md.array_relationships?.map((r) => r.name)).toEqual(['notes']);

    const renamed = buildTableMetadata(
      { name: 'organizations', profile: 'none', relationshipNames: { 'organization_settings_organization_id_fkey#array': 'settings' } },
      ['id'],
      [],
      [settings],
    );
    expect(renamed.object_relationships?.map((r) => r.name)).toEqual(['settings']);
    expect(renamed.array_relationships).toBeUndefined();
  });
});
