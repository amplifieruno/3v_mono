import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import { runSqlRows } from './support/sql.js';

/** Evaluates itap.<fn>(value::jsonb); `null` passes SQL NULL. Returns the boolean (SQL NULL -> null). */
async function check(fn: 'valid_windows' | 'valid_shape', value: unknown): Promise<boolean | null> {
  const arg = value === null ? 'null' : `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  const rows = await runSqlRows(`select itap.${fn}(${arg}) as r;`);
  const r = rows[0]?.r;
  return r === null || r === undefined || r === 'NULL' ? null : r === 't' || r === 'true';
}

describe('itap.valid_windows', () => {
  it('should accept well-formed windows, including overnight, 24:00 ends and an empty list', async () => {
    expect(await check('valid_windows', [])).toBe(true);
    expect(await check('valid_windows', [{ days: [1, 2, 3, 4, 5], from: '08:00', to: '20:00' }])).toBe(true);
    expect(await check('valid_windows', [{ days: [1, 2, 3, 4, 5, 6, 7], from: '22:00', to: '06:00' }])).toBe(true);
    expect(await check('valid_windows', [{ days: [7], from: '00:00', to: '24:00' }])).toBe(true);
  });

  it('should reject NULL, non-arrays and non-object entries', async () => {
    expect(await check('valid_windows', null)).toBe(false);
    expect(await check('valid_windows', { days: [1], from: '08:00', to: '09:00' })).toBe(false);
    expect(await check('valid_windows', 'always')).toBe(false);
    expect(await check('valid_windows', [null])).toBe(false);
    expect(await check('valid_windows', [[1, '08:00', '09:00']])).toBe(false);
  });

  it('should reject bad days', async () => {
    for (const days of [[], [0], [8], [1.5], ['1'], null, 1]) {
      expect(await check('valid_windows', [{ days, from: '08:00', to: '09:00' }]), JSON.stringify(days)).toBe(false);
    }
    expect(await check('valid_windows', [{ from: '08:00', to: '09:00' }])).toBe(false);
  });

  it('should reject bad times and unknown keys', async () => {
    for (const [from, to] of [
      ['8:00', '09:00'],
      ['08:00', '25:00'],
      ['24:00', '09:00'],
      ['08:60', '09:00'],
      ['08:00', '24:01'],
      [800, '09:00'],
      ['08:00', null],
    ]) {
      expect(await check('valid_windows', [{ days: [1], from, to }]), `${from}-${to}`).toBe(false);
    }
    expect(await check('valid_windows', [{ days: [1], from: '08:00' }])).toBe(false);
    expect(await check('valid_windows', [{ days: [1], form: '08:00', from: '08:00', to: '09:00' }])).toBe(false);
  });
});

describe('itap.valid_shape', () => {
  it('should accept polygons (with or without a closing point, with holes) and circles', async () => {
    expect(await check('valid_shape', { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10]]] })).toBe(true);
    expect(
      await check('valid_shape', { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[2, 2], [3, 2], [3, 3]]] }),
    ).toBe(true);
    expect(await check('valid_shape', { type: 'Circle', center: [50.5, 20], radius: 12.5 })).toBe(true);
  });

  it('should reject NULL, unknown types and malformed polygons', async () => {
    expect(await check('valid_shape', null)).toBe(false);
    expect(await check('valid_shape', [])).toBe(false);
    expect(await check('valid_shape', { type: 'Point', coordinates: [1, 2] })).toBe(false);
    expect(await check('valid_shape', { type: 'Polygon' })).toBe(false);
    expect(await check('valid_shape', { type: 'Polygon', coordinates: [] })).toBe(false);
    expect(await check('valid_shape', { type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] })).toBe(false);
    expect(await check('valid_shape', { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [1]]] })).toBe(false);
    expect(await check('valid_shape', { type: 'Polygon', coordinates: [[[0, 0], [1, 1], ['a', 2]]] })).toBe(false);
    expect(await check('valid_shape', { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [2, 0]]], extra: 1 })).toBe(false);
  });

  it('should reject malformed circles', async () => {
    expect(await check('valid_shape', { type: 'Circle', center: [1, 2] })).toBe(false);
    expect(await check('valid_shape', { type: 'Circle', center: [1, 2], radius: 0 })).toBe(false);
    expect(await check('valid_shape', { type: 'Circle', center: [1, 2], radius: -3 })).toBe(false);
    expect(await check('valid_shape', { type: 'Circle', center: [1], radius: 3 })).toBe(false);
    expect(await check('valid_shape', { type: 'Circle', center: [1, 2], radius: '3' })).toBe(false);
  });
});

const INSERT_SCHEDULE = `
  mutation InsertSchedule($object: work_schedules_insert_input!) { insert_work_schedules_one(object: $object) { id } }
`;
const UPDATE_SCHEDULE = `
  mutation UpdateSchedule($id: uuid!, $windows: jsonb!) {
    update_work_schedules_by_pk(pk_columns: { id: $id }, _set: { windows: $windows }) { id }
  }
`;

describe('work_schedules.windows CHECK', () => {
  it('should reject malformed window entries on insert and update', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const bad = [{ days: [1], from: '9:00', to: '18:00' }];
    const e1 = await expectError(a.request(INSERT_SCHEDULE, { object: { name: 'bad', windows: bad } }));
    expect(e1.message).toMatch(/work_schedules_windows_valid|check constraint/i);
    const ok = await a.request<{ insert_work_schedules_one: { id: string } }>(INSERT_SCHEDULE, {
      object: { name: 'ok', windows: [{ days: [1], from: '09:00', to: '18:00' }] },
    });
    await expectError(a.request(UPDATE_SCHEDULE, { id: ok.insert_work_schedules_one.id, windows: [{ days: [9], from: '09:00', to: '18:00' }] }));
  });
});
