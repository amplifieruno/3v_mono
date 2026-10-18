import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import type { TableSpec } from '../metadata-src/types.js';
import { planMetadata, rewriteTablesYaml, type Introspection } from './plan-metadata.js';

const intro: Introspection = {
  columns: [
    { schema: 'itap', table: 'organizations', column: 'id' },
    { schema: 'itap', table: 'organizations', column: 'name' },
    { schema: 'itap', table: 'notes', column: 'id' },
    { schema: 'itap', table: 'notes', column: 'organization_id' },
    { schema: 'itap_results', table: 'detections', column: 'id' },
    { schema: 'itap_results', table: 'detections', column: 'organization_id' },
  ],
  foreignKeys: [
    {
      schema: 'itap',
      table: 'notes',
      columns: ['organization_id'],
      refSchema: 'itap',
      refTable: 'organizations',
      refColumns: ['id'],
      constraint: 'notes_org_fkey',
    },
    {
      schema: 'itap_results',
      table: 'detections',
      columns: ['organization_id'],
      refSchema: 'itap',
      refTable: 'organizations',
      refColumns: ['id'],
      constraint: 'detections_org_fkey',
    },
  ],
};

const specs: TableSpec[] = [
  { name: 'organizations', profile: 'none' },
  { name: 'notes', profile: 'tenant_crud' },
  { name: 'detections', schema: 'itap_results', profile: 'tenant_read' },
];

describe('planMetadata', () => {
  it('should emit one sorted file per spec, with cross-schema relationships', () => {
    const files = planMetadata(specs, intro);
    expect([...files.keys()]).toEqual(['itap_notes.yaml', 'itap_organizations.yaml', 'itap_results_detections.yaml']);
    const org = parse(files.get('itap_organizations.yaml') ?? '');
    expect(org.array_relationships.map((r: { name: string }) => r.name)).toEqual(['detections', 'notes']);
    expect(org.array_relationships[0].using.manual_configuration.remote_table).toEqual({
      schema: 'itap_results',
      name: 'detections',
    });
  });

  it('should be deterministic regardless of input order', () => {
    const shuffled: Introspection = {
      columns: [...intro.columns].reverse(),
      foreignKeys: [...intro.foreignKeys].reverse(),
    };
    expect([...planMetadata([...specs].reverse(), shuffled)]).toEqual([...planMetadata(specs, intro)]);
  });

  it('should not emit YAML anchors or aliases', () => {
    const notes = planMetadata(specs, intro).get('itap_notes.yaml') ?? '';
    expect(notes).toContain('_eq: X-Hasura-Organization-Id');
    expect(notes).not.toMatch(/[&*]a\d/);
  });

  it('should skip relationships to and from enum tables', () => {
    const withEnum: Introspection = {
      columns: [
        ...intro.columns,
        { schema: 'itap', table: 'kinds', column: 'value' },
        { schema: 'itap', table: 'notes', column: 'kind' },
      ],
      foreignKeys: [
        ...intro.foreignKeys,
        {
          schema: 'itap',
          table: 'notes',
          columns: ['kind'],
          refSchema: 'itap',
          refTable: 'kinds',
          refColumns: ['value'],
          constraint: 'notes_kind_fkey',
        },
      ],
    };
    const files = planMetadata([...specs, { name: 'kinds', isEnum: true, profile: 'none' }], withEnum);
    expect(parse(files.get('itap_notes.yaml') ?? '').object_relationships.map((r: { name: string }) => r.name)).toEqual(
      ['organization'],
    );
    expect(parse(files.get('itap_kinds.yaml') ?? '').array_relationships).toBeUndefined();
  });

  it('should fail when a spec has no table', () => {
    expect(() => planMetadata([...specs, { name: 'ghosts', profile: 'none' }], intro)).toThrow(/itap\.ghosts/);
  });

  it('should fail when a table has no spec', () => {
    expect(() => planMetadata(specs.slice(0, 2), intro)).toThrow(/itap_results\.detections/);
  });

  it('should fail on duplicate custom names across schemas', () => {
    const dup: TableSpec[] = [...specs, { name: 'notes', schema: 'itap_results', profile: 'none' }];
    expect(() => planMetadata(dup, intro)).toThrow(/Duplicate spec name "notes"/);
  });
});

describe('rewriteTablesYaml', () => {
  it('should keep auth/storage includes and replace generated ones', () => {
    const existing = [
      '- "!include auth_users.yaml"',
      '- "!include itap_old.yaml"',
      '- "!include storage_files.yaml"',
      '',
    ].join('\n');
    expect(rewriteTablesYaml(existing, ['itap_results_b.yaml', 'itap_a.yaml'])).toBe(
      [
        '- "!include auth_users.yaml"',
        '- "!include storage_files.yaml"',
        '- "!include itap_a.yaml"',
        '- "!include itap_results_b.yaml"',
        '',
      ].join('\n'),
    );
  });
});
