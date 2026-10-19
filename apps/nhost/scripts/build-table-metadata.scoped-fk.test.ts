import { describe, expect, it } from 'vitest';
import type { ForeignKey } from '../metadata-src/types.js';
import { buildTableMetadata } from './build-table-metadata.js';

// Same-facility composite FKs (design §4.1): (organization_id, facility_id, x_id) -> areas (organization_id, facility_id, id).
const parentFk: ForeignKey = {
  table: 'areas',
  columns: ['organization_id', 'facility_id', 'parent_id'],
  refTable: 'areas',
  refColumns: ['organization_id', 'facility_id', 'id'],
  constraint: 'areas_parent_fkey',
};
const facilityFk: ForeignKey = {
  table: 'areas',
  columns: ['organization_id', 'facility_id'],
  refTable: 'facilities',
  refColumns: ['organization_id', 'id'],
  constraint: 'areas_facility_fkey',
};
const accessPointFk = (column: string): ForeignKey => ({
  table: 'access_points',
  columns: ['organization_id', 'facility_id', column],
  refTable: 'areas',
  refColumns: ['organization_id', 'facility_id', 'id'],
  constraint: `access_points_${column.replace(/_id$/, '')}_fkey`,
});
const AREA_COLUMNS = ['id', 'organization_id', 'facility_id', 'parent_id', 'name'];

describe('buildTableMetadata: scoped (3-column) composite FKs', () => {
  it('should name the object end after the column that maps to the parent id, not the shared scope column', () => {
    const md = buildTableMetadata({ name: 'areas', profile: 'none' }, AREA_COLUMNS, [parentFk, facilityFk], [parentFk]);
    expect(md.object_relationships).toEqual([
      {
        name: 'facility',
        using: {
          manual_configuration: {
            remote_table: { schema: 'itap', name: 'facilities' },
            column_mapping: { organization_id: 'organization_id', facility_id: 'id' },
          },
        },
      },
      {
        name: 'parent',
        using: {
          manual_configuration: {
            remote_table: { schema: 'itap', name: 'areas' },
            column_mapping: { organization_id: 'organization_id', facility_id: 'facility_id', parent_id: 'id' },
          },
        },
      },
    ]);
    expect(md.array_relationships).toEqual([
      {
        name: 'areas',
        using: {
          manual_configuration: {
            remote_table: { schema: 'itap', name: 'areas' },
            column_mapping: { organization_id: 'organization_id', facility_id: 'facility_id', id: 'parent_id' },
          },
        },
      },
    ]);
  });

  it('should rename only the reverse end of a scoped self-reference with "#array"', () => {
    const md = buildTableMetadata(
      { name: 'areas', profile: 'none', relationshipNames: { 'areas_parent_fkey#array': 'children' } },
      AREA_COLUMNS,
      [parentFk, facilityFk],
      [parentFk],
    );
    expect(md.object_relationships?.map((r) => r.name)).toEqual(['facility', 'parent']);
    expect(md.array_relationships?.map((r) => r.name)).toEqual(['children']);
  });

  it('should disambiguate two scoped FKs from one child by their own columns', () => {
    const fks = [accessPointFk('area_id'), accessPointFk('from_area_id')];
    const md = buildTableMetadata({ name: 'areas', profile: 'none' }, AREA_COLUMNS, [], fks);
    expect(md.array_relationships?.map((r) => r.name)).toEqual(['access_points_by_area', 'access_points_by_from_area']);
    const child = buildTableMetadata(
      { name: 'access_points', profile: 'none' },
      ['id', 'organization_id', 'facility_id', 'area_id', 'from_area_id'],
      fks,
      [],
    );
    expect(child.object_relationships?.map((r) => r.name)).toEqual(['area', 'from_area']);
  });

  it('should keep the full stem when every own column has the same name as its referenced column', () => {
    const fk: ForeignKey = {
      table: 'area_stats',
      columns: ['organization_id', 'facility_id', 'area_id'],
      refTable: 'area_scopes',
      refColumns: ['organization_id', 'facility_id', 'area_id'],
      constraint: 'area_stats_scope_fkey',
    };
    const md = buildTableMetadata(
      { name: 'area_stats', profile: 'none' },
      ['id', 'organization_id', 'facility_id', 'area_id'],
      [fk],
      [],
    );
    expect(md.object_relationships?.map((r) => r.name)).toEqual(['facility_area']);
  });
});
