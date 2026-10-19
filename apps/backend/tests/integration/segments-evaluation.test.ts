import { describe, expect, it } from 'vitest';
import { expectError } from './support/fixtures.js';
import { insertOne, updateByPk } from './support/operations.js';
import {
  addMembers,
  createProfile,
  dynamicSegment,
  evaluate,
  exactRows,
  manualSegment,
  memberCount,
  openRows,
  preview,
  removeMembers,
  segmentWorld,
} from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';

const sorted = (ids: (string | null)[]) => [...ids].sort();
const ops = (department: string) => ({ field: 'department', operator: 'eq', value: department });

describe('preview_segment and evaluate_segment', () => {
  it('should preview exactly what evaluation adds, within the organization only', async () => {
    const w = await segmentWorld();
    const dept = `Ops-${Date.now()}`;
    const matching = [
      await createProfile(w.a, { department: dept, first_name: 'Ann' }),
      await createProfile(w.a, { department: dept }),
      await createProfile(w.a, { department: dept }),
    ];
    await createProfile(w.a, { department: 'Other' });
    const foreign = await createProfile(w.b, { department: dept });

    const shown = await preview(w.a, 'profiles', ops(dept), 2);
    expect(shown.count).toBe(3);
    expect(shown.sample_ids).toEqual(sorted(matching).slice(0, 2));
    expect(shown.sample_labels).toHaveLength(2);
    expect(shown.sample_labels.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);

    const segment = await dynamicSegment(w.a, 'profiles', ops(dept));
    const result = await evaluate(w.a, segment.id);
    expect(result).toMatchObject({ segment_id: segment.id, added: 3, removed: 0, member_count: 3, stale: false });
    expect((await openRows(segment.id)).map(([s]) => s)).toEqual(sorted(matching));
    expect((await openRows(segment.id)).every(([, source]) => source === 'rule')).toBe(true);
    expect((await openRows(segment.id)).some(([s]) => s === foreign)).toBe(false);
    const [row] = await runSqlRows(`SELECT last_evaluated_at FROM itap.segments WHERE id = '${segment.id}'`);
    expect(Date.parse(String(row.last_evaluated_at))).toBe(Date.parse(result.evaluated_at));

    // The other organization's admin sees its own profile only, and cannot evaluate org A's segment.
    expect((await preview(w.b, 'profiles', ops(dept))).sample_ids).toEqual([foreign]);
    expect((await expectError(evaluate(w.b, segment.id))).message).toMatch(/segment_not_found/);
  });

  it('should be idempotent and keep exact churn history', async () => {
    const w = await segmentWorld();
    const dept = `Churn-${Date.now()}`;
    const stays = await createProfile(w.a, { department: dept });
    const leaves = await createProfile(w.a, { department: dept });
    const segment = await dynamicSegment(w.a, 'profiles', ops(dept));
    await evaluate(w.a, segment.id);
    const before = await exactRows(segment.id);
    expect(await evaluate(w.a, segment.id)).toMatchObject({ added: 0, removed: 0, member_count: 2 });
    expect(await exactRows(segment.id)).toEqual(before);

    await updateByPk(w.a, 'profiles', leaves, { department: 'Elsewhere' });
    const second = await evaluate(w.a, segment.id);
    expect(second).toMatchObject({ added: 0, removed: 1, member_count: 1 });
    const rows = await exactRows(segment.id);
    expect(rows).toHaveLength(2);
    const closed = rows.find((r) => r.subject === leaves);
    expect(Date.parse(String(closed?.removed_at))).toBe(Date.parse(second.evaluated_at));
    expect(closed?.removed_by).toBe('NULL');
    expect(rows.find((r) => r.subject === stays)?.removed_at).toBe('NULL');

    // Coming back opens a new row; the old one stays closed.
    await updateByPk(w.a, 'profiles', leaves, { department: dept });
    expect(await evaluate(w.a, segment.id)).toMatchObject({ added: 1, removed: 0, member_count: 2 });
    expect(await exactRows(segment.id)).toHaveLength(3);
  });

  it('should never close manual rows (Review Focus 1)', async () => {
    const w = await segmentWorld();
    const dept = `Manual-${Date.now()}`;
    const pinned = await createProfile(w.a, { department: dept });
    const handPicked = await createProfile(w.a, { department: 'Nope' });
    const segment = await dynamicSegment(w.a, 'profiles', ops(dept));
    await evaluate(w.a, segment.id);
    await addMembers(w.a, segment.id, [pinned, handPicked]);
    await updateByPk(w.a, 'profiles', pinned, { department: 'Gone' });
    expect(await evaluate(w.a, segment.id)).toMatchObject({ added: 0, removed: 0, member_count: 2 });
    expect(await openRows(segment.id)).toEqual(sorted([pinned, handPicked]).map((s) => [s, 'manual']));

    // Out of its window, a segment closes every rule row and still keeps the manual ones.
    const extra = await createProfile(w.a, { department: dept });
    await evaluate(w.a, segment.id);
    expect(await memberCount(segment.id)).toBe(3);
    await updateByPk(w.a, 'segments', segment.id, { status: 'inactive' });
    expect(await evaluate(w.a, segment.id)).toMatchObject({ added: 0, removed: 1, member_count: 2 });
    expect((await openRows(segment.id)).some(([s]) => s === extra)).toBe(false);
  });

  it('should leave no duplicate open rows under concurrent evaluations (Review Focus 2)', async () => {
    const w = await segmentWorld();
    const dept = `Race-${Date.now()}`;
    const ids = await Promise.all([1, 2, 3, 4].map(() => createProfile(w.a, { department: dept })));
    const segment = await dynamicSegment(w.a, 'profiles', ops(dept));
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map(() => evaluate(w.a, segment.id)));
    expect(results.reduce((n, r) => n + r.added, 0)).toBe(4);
    expect(await openRows(segment.id)).toEqual(sorted(ids).map((s) => [s, 'rule']));
    expect(await exactRows(segment.id)).toHaveLength(4);
    expect(await memberCount(segment.id)).toBe(4);
  });

  it('should refuse manual segments, foreign segments and invalid previews', async () => {
    const w = await segmentWorld();
    const manual = await manualSegment(w.a, 'profiles');
    expect((await expectError(evaluate(w.a, manual.id))).message).toMatch(/segment_not_dynamic/);
    const bad = { field: 'nope', operator: 'eq', value: 1 };
    expect((await expectError(preview(w.a, 'profiles', bad))).message).toMatch(/segment_condition_invalid:\$\.field/);
    const foreignArea = { field: 'top_area_id', operator: 'eq', value: w.areaB.id };
    expect((await expectError(preview(w.a, 'profiles', foreignArea))).message).toMatch(/segment_condition_invalid:\$\.value/);
    expect((await expectError(preview(w.a, 'groups', ops('x')))).code).toBe('invalid_input');
  });

  it('should evaluate on_shift_now, visit_status_today and member_of_segment at the evaluation time', async () => {
    const w = await segmentWorld();
    const always = await insertOne(w.a, 'work_schedules', {
      name: 'Always',
      timezone: 'UTC',
      windows: [{ days: [1, 2, 3, 4, 5, 6, 7], from: '00:00', to: '24:00' }],
    });
    const never = await insertOne(w.a, 'work_schedules', { name: 'Never', timezone: 'UTC', windows: [] });
    const onShift = await createProfile(w.a, { work_schedule_id: always.id });
    const offShift = await createProfile(w.a, { work_schedule_id: never.id });
    const noSchedule = await createProfile(w.a);
    const scoped = (value: boolean) => ({
      op: 'and',
      children: [{ field: 'on_shift_now', operator: 'eq', value }, { field: 'member_of_segment', operator: 'eq', value: group.id }],
    });
    const group = await manualSegment(w.a, 'profiles');
    await addMembers(w.a, group.id, [onShift, offShift, noSchedule]);
    expect(sorted((await preview(w.a, 'profiles', scoped(true))).sample_ids)).toEqual([onShift]);
    expect(sorted((await preview(w.a, 'profiles', scoped(false))).sample_ids)).toEqual(sorted([offShift, noSchedule]));

    const visitor = await createProfile(w.a, { profile_type: 'visitor' });
    // Noon of today's organization-local day (test organizations are UTC): inside the evaluation day at any time.
    const noon = `${new Date().toISOString().slice(0, 10)}T12:00:00.000Z`;
    await insertOne(w.a, 'visits', {
      visitor_profile_id: visitor,
      expected_start: noon,
      expected_end: new Date(Date.parse(noon) + 3600_000).toISOString(),
    });
    await addMembers(w.a, group.id, [visitor]);
    const today = (operator: string, value: unknown) => ({
      op: 'and',
      children: [{ field: 'visit_status_today', operator, value }, { field: 'member_of_segment', operator: 'eq', value: group.id }],
    });
    expect((await preview(w.a, 'profiles', today('eq', 'scheduled'))).sample_ids).toEqual([visitor]);
    expect((await preview(w.a, 'profiles', today('eq', 'checked_in'))).count).toBe(0);
    expect((await preview(w.a, 'profiles', today('is_null', true))).count).toBe(3);
    expect((await preview(w.a, 'profiles', { field: 'member_of_segment', operator: 'neq', value: group.id })).sample_ids)
      .not.toContain(visitor);
  });

  it('should count member_of_segment only for rows open at the evaluation time', async () => {
    const w = await segmentWorld();
    const [future, closing, closed] = [await createProfile(w.a), await createProfile(w.a), await createProfile(w.a)];
    const group = await manualSegment(w.a, 'profiles');
    await addMembers(w.a, group.id, [closed]);
    const [row] = await removeMembers(w.a, group.id, [closed]);
    // future: opens tomorrow (not yet a member); closing: closes tomorrow (still a member now); closed: closed now.
    await runSql(
      `INSERT INTO itap.segment_members (organization_id, segment_id, target, profile_id, source, added_by, added_at, removed_at, removed_by)
       VALUES ('${w.orgA.id}', '${group.id}', 'profiles', '${future}', 'manual', '${row.added_by}', now() + interval '1 day', NULL, NULL),
              ('${w.orgA.id}', '${group.id}', 'profiles', '${closing}', 'manual', '${row.added_by}', now() - interval '1 hour',
               now() + interval '1 day', '${row.removed_by}')`,
    );
    const member = { field: 'member_of_segment', operator: 'eq', value: group.id };
    expect((await preview(w.a, 'profiles', member)).sample_ids).toEqual([closing]);
    const outside = (await preview(w.a, 'profiles', { field: 'member_of_segment', operator: 'neq', value: group.id }, 100)).sample_ids;
    expect(outside).toEqual(expect.arrayContaining([future, closed]));
    expect(outside).not.toContain(closing);
  });
});
