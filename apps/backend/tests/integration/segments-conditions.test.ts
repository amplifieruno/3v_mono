import { describe, expect, it } from 'vitest';
import type { HasuraClient } from '../../src/hasura/client.js';
import { expectDenied, expectError } from './support/fixtures.js';
import { insertOne, updateByPk } from './support/operations.js';
import { dynamicSegment, manualSegment, segmentWorld } from './support/segments.js';
import { runSqlRows } from './support/sql.js';

type Field = { field: string; value_type: string; operators: string[]; enum_values: string[] | null; label: string };

const catalog = async (client: HasuraClient, target: string): Promise<Field[]> =>
  (
    await client.request<{ segment_fields: Field[] }>(
      `query($t: String!) { segment_fields(args: {p_target: $t}, order_by: {field: asc}) { field value_type operators enum_values label } }`,
      { t: target },
    )
  ).segment_fields;

const conditionError = (path: string): RegExp =>
  new RegExp(`segment_condition_invalid:${path.replace(/[.$[\]]/g, (c) => `\\${c}`)}$`);

/** Asserts that saving a dynamic segment with these conditions fails at `path`. */
async function rejectsAt(client: HasuraClient, target: string, conditions: unknown, path: string): Promise<void> {
  const error = await expectError(dynamicSegment(client, target, conditions));
  expect(error.message).toMatch(conditionError(path));
}

describe('segment field catalog', () => {
  it('should list the fields, value types and operators per target, including the organization custom fields', async () => {
    const w = await segmentWorld();
    await insertOne(w.a, 'custom_attribute_definitions', { entity: 'profile', key: 'badge_color', label: 'Badge', data_type: 'enum', options: ['red', 'blue'] });
    await insertOne(w.a, 'custom_attribute_definitions', { entity: 'profile', key: 'floor', label: 'Floor', data_type: 'number' });
    const profiles = await catalog(w.a, 'profiles');
    const byName = Object.fromEntries(profiles.map((f) => [f.field, f]));
    expect(Object.keys(byName)).toEqual(
      expect.arrayContaining([
        'profile_type', 'status', 'access_level', 'company_id', 'department', 'job_title', 'start_date', 'end_date',
        'work_schedule_id', 'on_shift_now', 'has_face', 'is_blacklisted', 'visit_status_today', 'member_of_segment',
        'visits_last_30d', 'avg_dwell_minutes', 'last_seen_days_ago', 'top_area_id', 'after_hours_visits_30d',
        'custom_fields.badge_color', 'custom_fields.floor',
      ]),
    );
    expect(byName.profile_type).toMatchObject({ value_type: 'enum', enum_values: ['contractor', 'employee', 'vip', 'visitor'] });
    expect(byName['custom_fields.badge_color']).toMatchObject({ value_type: 'enum', enum_values: ['red', 'blue'] });
    expect(byName['custom_fields.floor'].value_type).toBe('number');
    expect(byName.visits_last_30d.operators).toEqual(expect.arrayContaining(['gte', 'between', 'is_null']));
    expect(byName.has_face.operators).toEqual(['eq']);
    expect(byName.top_area_id).toMatchObject({ value_type: 'area', operators: ['eq', 'neq', 'in', 'nin', 'is_null'], label: 'Most visited area (30 days)' });
    expect(byName.member_of_segment.value_type).toBe('segment');
    // jsonb-path fields take only what a Hasura where can express on them.
    expect(byName['custom_fields.floor'].operators).toEqual(['eq', 'neq', 'in', 'nin', 'is_null']);
    const identityFields = await catalog(w.a, 'identities');
    const identities = identityFields.map((f) => f.field);
    expect(identityFields.find((f) => f.field === 'attributes.gender')?.operators).toEqual(['eq', 'neq', 'in', 'nin', 'is_null']);
    expect(identityFields.find((f) => f.field === 'age')?.operators).toEqual(expect.arrayContaining(['gte', 'between', 'is_null']));
    expect(identities.sort()).toEqual(
      [
        'after_hours_visits_30d', 'age', 'attributes.gender', 'avg_dwell_minutes', 'detection_count', 'first_seen_at',
        'last_seen_days_ago', 'linked', 'member_of_segment', 'status', 'top_area_id', 'visits_last_30d',
      ].sort(),
    );
    // Another organization does not see org A's custom fields.
    expect((await catalog(w.b, 'profiles')).some((f) => f.field.startsWith('custom_fields.'))).toBe(false);
  });
});

describe('segment condition validation', () => {
  it('should reject malformed structures with the path of the first error', async () => {
    const w = await segmentWorld();
    const ok = { field: 'visits_last_30d', operator: 'gte', value: 3 };
    await insertOne(w.a, 'custom_attribute_definitions', { entity: 'profile', key: 'floor', label: 'Floor', data_type: 'number' });
    await rejectsAt(w.a, 'identities', [], '$');
    await rejectsAt(w.a, 'identities', { op: 'xor', children: [ok] }, '$.op');
    await rejectsAt(w.a, 'identities', { op: 'and', children: [] }, '$.children');
    await rejectsAt(w.a, 'identities', { op: 'not', children: [ok, ok] }, '$.children');
    await rejectsAt(w.a, 'identities', { op: 'and', children: [ok], extra: 1 }, '$');
    await rejectsAt(w.a, 'identities', { op: 'or', children: [ok, { field: 'visits_last_30d', operator: 'gte' }] }, '$.children[1]');
    await rejectsAt(w.a, 'identities', { op: 'or', children: [ok, { field: 'salary', operator: 'eq', value: 1 }] }, '$.children[1].field');
    await rejectsAt(w.a, 'identities', { field: 'profile_type', operator: 'eq', value: 'vip' }, '$.field');
    await rejectsAt(w.a, 'identities', { field: 'linked', operator: 'gt', value: true }, '$.operator');
    await rejectsAt(w.a, 'identities', { field: 'detection_count', operator: 'gte', value: '5' }, '$.value');
    await rejectsAt(w.a, 'identities', { field: 'detection_count', operator: 'gte', value: 2.5 }, '$.value');
    await rejectsAt(w.a, 'identities', { field: 'detection_count', operator: 'in', value: [] }, '$.value');
    await rejectsAt(w.a, 'identities', { field: 'detection_count', operator: 'between', value: [9, 1] }, '$.value');
    await rejectsAt(w.a, 'identities', { field: 'status', operator: 'in', value: ['verified', 'famous'] }, '$.value[1]');
    await rejectsAt(w.a, 'identities', { field: 'first_seen_at', operator: 'lt', value: 'yesterday' }, '$.value');
    await rejectsAt(w.a, 'profiles', { field: 'department', operator: 'contains', value: '' }, '$.value');
    await rejectsAt(w.a, 'profiles', { field: 'end_date', operator: 'lte', value: { relative_days: 'x' } }, '$.value');
    await rejectsAt(w.a, 'profiles', { field: 'profile_type', operator: 'is_null', value: true }, '$.operator');
    await rejectsAt(w.a, 'profiles', { field: 'custom_fields.unknown', operator: 'eq', value: 1 }, '$.field');
    // Size and range caps.
    const many = (n: number) => Array.from({ length: n }, () => ok);
    await dynamicSegment(w.a, 'identities', { op: 'or', children: many(100) });
    await rejectsAt(w.a, 'identities', { op: 'or', children: many(101) }, '$.children');
    const counts = (n: number) => Array.from({ length: n }, (_, i) => i);
    await dynamicSegment(w.a, 'identities', { field: 'detection_count', operator: 'in', value: counts(500) });
    await rejectsAt(w.a, 'identities', { field: 'detection_count', operator: 'in', value: counts(501) }, '$.value');
    await rejectsAt(w.a, 'identities', { field: 'detection_count', operator: 'gt', value: 2147483648 }, '$.value');
    await rejectsAt(w.a, 'identities', { field: 'avg_dwell_minutes', operator: 'gt', value: 1e16 }, '$.value');
    await rejectsAt(w.a, 'identities', { field: 'first_seen_at', operator: 'gt', value: { relative_days: -36501 } }, '$.value');
    await rejectsAt(w.a, 'identities', { field: 'attributes.gender', operator: 'contains', value: 'f' }, '$.operator');
    await rejectsAt(w.a, 'profiles', { field: 'custom_fields.floor', operator: 'gt', value: 3 }, '$.operator');
    await dynamicSegment(w.a, 'identities', { field: 'age', operator: 'between', value: [18, 30] });
    const deep = { op: 'not', children: [{ op: 'not', children: [{ op: 'not', children: [{ op: 'not', children: [{ op: 'not', children: [{ op: 'not', children: [{ op: 'not', children: [{ op: 'not', children: [ok] }] }] }] }] }] }] }] };
    await rejectsAt(w.a, 'identities', deep, '$.children[0].children[0].children[0].children[0].children[0].children[0].children[0]');
    // A valid tree with every kind of value is accepted.
    const s = await dynamicSegment(w.a, 'profiles', {
      op: 'and',
      children: [
        { field: 'profile_type', operator: 'in', value: ['contractor', 'visitor'] },
        { field: 'end_date', operator: 'between', value: [{ relative_days: 0 }, { relative_days: 14 }] },
        { field: 'start_date', operator: 'gte', value: '2026-01-01' },
        { field: 'avg_dwell_minutes', operator: 'gt', value: 12.5 },
        { field: 'last_seen_days_ago', operator: 'is_null', value: false },
        { op: 'not', children: [{ field: 'is_blacklisted', operator: 'eq', value: true }] },
        { op: 'or', children: [{ field: 'department', operator: 'contains', value: 'Sec' }, { field: 'on_shift_now', operator: 'eq', value: true }] },
      ],
    });
    expect(s.kind).toBe('dynamic');
    // Updates are validated too.
    const error = await expectError(updateByPk(w.a, 'segments', s.id, { conditions: { field: 'nope', operator: 'eq', value: 1 } }));
    expect(error.message).toMatch(conditionError('$.field'));
  });

  it('should accept referenced ids only from the organization and segments only when manual of the same target', async () => {
    const w = await segmentWorld();
    const company = await insertOne(w.a, 'companies', { name: 'Acme', kind: 'tenant' });
    const otherCompany = await insertOne(w.b, 'companies', { name: 'Other', kind: 'tenant' });
    await dynamicSegment(w.a, 'identities', { field: 'top_area_id', operator: 'in', value: [w.zone.id, w.lobby.id] });
    await rejectsAt(w.a, 'identities', { field: 'top_area_id', operator: 'in', value: [w.zone.id, w.areaB.id] }, '$.value[1]');
    await rejectsAt(w.a, 'identities', { field: 'top_area_id', operator: 'eq', value: 'not-a-uuid' }, '$.value');
    await dynamicSegment(w.a, 'profiles', { field: 'company_id', operator: 'eq', value: company.id });
    await rejectsAt(w.a, 'profiles', { field: 'company_id', operator: 'eq', value: otherCompany.id }, '$.value');
    const manualProfiles = await manualSegment(w.a, 'profiles');
    const manualIdentities = await manualSegment(w.a, 'identities');
    const theirs = await manualSegment(w.b, 'profiles');
    const dynamic = await dynamicSegment(w.a, 'profiles', { field: 'member_of_segment', operator: 'eq', value: manualProfiles.id });
    // Dynamic segments, segments of the other target or of another organization cannot be referenced.
    await rejectsAt(w.a, 'profiles', { field: 'member_of_segment', operator: 'eq', value: dynamic.id }, '$.value');
    await rejectsAt(w.a, 'profiles', { field: 'member_of_segment', operator: 'in', value: [manualProfiles.id, manualIdentities.id] }, '$.value[1]');
    await rejectsAt(w.a, 'profiles', { field: 'member_of_segment', operator: 'nin', value: [theirs.id] }, '$.value[0]');
    // A segment cannot reference itself (it is dynamic, and self-references are rejected explicitly).
    const error = await expectError(updateByPk(w.a, 'segments', dynamic.id, { conditions: { field: 'member_of_segment', operator: 'eq', value: dynamic.id } }));
    expect(error.message).toMatch(conditionError('$.value'));
    // The SQL validator is callable directly (as the backend translator's pre-check) and raises the same code.
    await expect(
      runSqlRows(`SELECT itap.validate_segment_conditions('${w.orgA.id}', 'profiles', '{"field":"company_id","operator":"eq","value":"${otherCompany.id}"}')`),
    ).rejects.toThrow(/segment_condition_invalid:\$\.value/);
  });

  it('should derive identities.age from attributes.age when it is a whole number', async () => {
    const w = await segmentWorld();
    const ages = [];
    for (const age of [34, '41', 34.5, 'old', null]) {
      const [row] = await runSqlRows(
        `INSERT INTO itap.identities (organization_id, attributes) VALUES ('${w.orgA.id}', '${JSON.stringify({ age })}') RETURNING age`,
      );
      ages.push(row.age);
    }
    expect(ages).toEqual(['34', '41', 'NULL', 'NULL', 'NULL']);
  });

  it('should keep org_admin out of the other organization segments when referencing', async () => {
    const w = await segmentWorld();
    const mine = await manualSegment(w.a, 'profiles');
    // Org B cannot even name org A's segment.
    await rejectsAt(w.b, 'profiles', { field: 'member_of_segment', operator: 'eq', value: mine.id }, '$.value');
    await expectDenied(insertOne(w.b, 'segments', { name: 'x', kind: 'manual', target: 'profiles', organization_id: w.orgA.id }), 'organization_id');
  });
});
