import { f } from '@burojs/field-types';
import { describe, expect, it } from 'vitest';
import { ITAP_TABLES, hasuraTable, selectFieldsOf } from '../../src/data/mapping';

describe('hasuraTable', () => {
  it('should default to a uuid `id` primary key ordered by `created_at`', () => {
    expect(hasuraTable('areas', { selectFields: ['id', 'name'] })).toEqual({
      table: 'areas',
      selectFields: ['id', 'name'],
      pkType: 'uuid',
      pkField: 'id',
      orderByField: 'created_at',
    });
  });

  it('should let a mapping override a default', () => {
    const mapping = hasuraTable('detections', {
      selectFields: ['id'],
      orderByField: 'detected_at',
      noAggregate: true,
    });
    expect(mapping.orderByField).toBe('detected_at');
    expect(mapping.noAggregate).toBe(true);
    expect(mapping.pkType).toBe('uuid');
  });

  it('should select nothing when no field list is given', () => {
    expect(hasuraTable('areas').selectFields).toEqual([]);
  });
});

describe('selectFieldsOf', () => {
  it('should return the declared column names and skip links', () => {
    const fields = {
      id: f.uuid(),
      name: f.string(),
      facility_id: f.relation({ to: 'facility' }),
      segments: f.relationMany({
        to: 'segment',
        through: { resource: 'segment_member', sourceKey: 'profile_id', targetKey: 'segment_id' },
      }),
    };
    expect(selectFieldsOf(fields)).toEqual(['id', 'name', 'facility_id']);
  });

  it('should skip dotted names', () => {
    expect(selectFieldsOf({ id: f.uuid(), 'company_id.name': f.string() })).toEqual(['id']);
  });
});

describe('ITAP_TABLES', () => {
  it('should map every resource to a uuid primary key that it selects', () => {
    const entries = Object.entries(ITAP_TABLES);
    expect(entries.length).toBeGreaterThan(0);
    for (const [, mapping] of entries) {
      expect(mapping.pkType).toBe('uuid');
      expect(mapping.selectFields).toContain(mapping.pkField ?? 'id');
    }
  });

  it('should map the organization and facility resources to their Hasura roots', () => {
    expect(ITAP_TABLES.organization?.table).toBe('organizations');
    expect(ITAP_TABLES.facility?.table).toBe('facilities');
  });
});
