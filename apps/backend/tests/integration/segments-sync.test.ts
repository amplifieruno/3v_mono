import { describe, expect, it } from 'vitest';
import { segmentWhere } from '../../src/segments/translate.js';
import type { CatalogField, SegmentTarget } from '../../src/segments/types.js';
import { expectError } from './support/fixtures.js';
import {
  addMembers,
  asActor,
  createProfile,
  dynamicSegment,
  evaluate,
  exactRows,
  manualSegment,
  mergeInto,
  openRows,
  preview,
  removeMembers,
  segmentWorld,
  syncMembers,
} from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';
import { at, createIdentity, detect } from './support/tracking.js';

const DAY = 86400;
const sorted = (ids: string[]) => [...ids].sort();

describe('sync_segment_members', () => {
  it('should open and close rule rows only, skip merged and foreign ids, and ignore stale evaluations', async () => {
    const w = await segmentWorld();
    const actor = asActor(w.orgA.id, w.user.id);
    const segment = await dynamicSegment(w.a, 'identities', { field: 'detection_count', operator: 'gte', value: 0 });
    const [i1, i2, merged] = [w.identity, await createIdentity(w.a), await createIdentity(w.a)];
    const foreign = await createIdentity(w.b);
    await addMembers(w.a, segment.id, [i2]);
    await mergeInto(w.a, i1, [merged]);

    expect(await syncMembers(actor, segment.id, [i1, i2, merged, foreign], at(DAY))).toMatchObject({
      added: 1, removed: 0, member_count: 2, stale: false,
    });
    expect(await openRows(segment.id)).toEqual(sorted([i1, i2]).map((s) => [s, s === i2 ? 'manual' : 'rule']));
    // Same input again: nothing changes (idempotent).
    expect(await syncMembers(actor, segment.id, [i1, i2], at(DAY))).toMatchObject({ added: 0, removed: 0, member_count: 2 });
    // An evaluation older than the last one is stale and changes nothing.
    expect(await syncMembers(actor, segment.id, [], at(0))).toMatchObject({ added: 0, removed: 0, stale: true });
    // Nothing matches any more: the rule row closes at the evaluation time, the manual row stays.
    expect(await syncMembers(actor, segment.id, [], at(2 * DAY))).toMatchObject({ added: 0, removed: 1, member_count: 1 });
    const rows = await exactRows(segment.id);
    expect(rows.find((r) => r.subject === i1)?.removed_at).toMatch(/^2026-01-07/);

    const manual = await manualSegment(w.a, 'identities');
    expect((await expectError(syncMembers(actor, manual.id, [i1], at(3 * DAY)))).message).toMatch(/segment_not_dynamic/);
    const otherOrg = asActor(w.orgB.id, w.other.id);
    expect((await expectError(syncMembers(otherOrg, segment.id, [i1], at(3 * DAY)))).message).toMatch(/segment_not_found/);
  });

  it("should open a rule row no earlier than the subject's last closed row (no overlapping intervals)", async () => {
    const w = await segmentWorld();
    const actor = asActor(w.orgA.id, w.user.id);
    const segment = await dynamicSegment(w.a, 'identities', { field: 'detection_count', operator: 'gte', value: 0 });
    await addMembers(w.a, segment.id, [w.identity]);
    const [closed] = await removeMembers(w.a, segment.id, [w.identity]);
    // An evaluation time before the manual row closed (now): the rule row starts when the manual row ended.
    expect(await syncMembers(actor, segment.id, [w.identity], at(0))).toMatchObject({ added: 1 });
    const rows = await exactRows(segment.id);
    const rule = rows.find((r) => r.source === 'rule');
    expect(Date.parse(String(rule?.added_at))).toBe(Date.parse(String(closed.removed_at)));
  });

  it('should not be callable by org_admin directly', async () => {
    const w = await segmentWorld();
    const segment = await dynamicSegment(w.a, 'profiles', { field: 'first_name', operator: 'eq', value: 'x' });
    const error = await expectError(syncMembers(w.a, segment.id, [], at(0)));
    expect(error.code).toBe('validation-failed');
  });
});

describe('behavioral metric conditions', () => {
  it('should match activity stats after refresh_activity_stats; subjects without stats never match a comparison', async () => {
    const w = await segmentWorld();
    const profile = await createProfile(w.a);
    const faceless = await createProfile(w.a);
    await runSql(`UPDATE itap.identities SET profile_id = '${profile}' WHERE id = '${w.identity}'`);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    await detect(w.orgA.id, w.lobbyCam, w.identity, DAY);
    const group = await manualSegment(w.a, 'profiles');
    await addMembers(w.a, group.id, [profile, faceless]);
    const inGroup = (leaf: unknown) => ({ op: 'and', children: [leaf, { field: 'member_of_segment', operator: 'eq', value: group.id }] });
    const visits = { field: 'visits_last_30d', operator: 'gte', value: 2 };
    const few = { field: 'visits_last_30d', operator: 'lt', value: 5 };

    expect((await preview(w.a, 'profiles', inGroup(visits))).count).toBe(0);
    await runSql(`SELECT itap.refresh_activity_stats('${w.orgA.id}', '${at(2 * DAY)}')`);
    expect((await preview(w.a, 'profiles', inGroup(visits))).sample_ids).toEqual([profile]);
    // Review Focus 5: no stats row -> comparison false, its negation true, is_null true.
    expect((await preview(w.a, 'profiles', inGroup(few))).sample_ids).toEqual([profile]);
    expect((await preview(w.a, 'profiles', inGroup({ op: 'not', children: [few] }))).sample_ids).toEqual([faceless]);
    const isNull = { field: 'visits_last_30d', operator: 'is_null', value: true };
    expect((await preview(w.a, 'profiles', inGroup(isNull))).sample_ids).toEqual([faceless]);

    const unknownFrequent = await dynamicSegment(w.a, 'identities', {
      op: 'and',
      children: [{ field: 'visits_last_30d', operator: 'gte', value: 2 }, { field: 'linked', operator: 'eq', value: true }],
    });
    expect(await evaluate(w.a, unknownFrequent.id)).toMatchObject({ added: 1, member_count: 1 });
    expect(await openRows(unknownFrequent.id)).toEqual([[w.identity, 'rule']]);
  });

  it('should treat a stats row with a NULL top area like a missing stats row', async () => {
    const w = await segmentWorld();
    const [stale, unseen, recent] = [w.identity, await createIdentity(w.a), await createIdentity(w.a)];
    await detect(w.orgA.id, w.lobbyCam, stale, 0);
    await detect(w.orgA.id, w.lobbyCam, recent, 35 * DAY);
    // Window = 30 days before day 40: stale keeps a row (last_seen_at) without a top area; unseen has no row.
    await runSql(`SELECT itap.refresh_activity_stats('${w.orgA.id}', '${at(40 * DAY)}')`);
    const group = await manualSegment(w.a, 'identities');
    await addMembers(w.a, group.id, [stale, unseen, recent]);
    const inGroup = (leaf: unknown) => ({ op: 'and', children: [leaf, { field: 'member_of_segment', operator: 'eq', value: group.id }] });
    const lobby = { field: 'top_area_id', operator: 'eq', value: w.lobby.id };
    expect((await preview(w.a, 'identities', inGroup(lobby))).sample_ids).toEqual([recent]);
    expect(sorted((await preview(w.a, 'identities', inGroup({ op: 'not', children: [lobby] }))).sample_ids)).toEqual(sorted([stale, unseen]));
    const isNull = { field: 'top_area_id', operator: 'is_null', value: true };
    expect(sorted((await preview(w.a, 'identities', inGroup(isNull))).sample_ids)).toEqual(sorted([stale, unseen]));
  });
});

describe('the live field catalog', () => {
  const sample = (f: CatalogField, relative: boolean): unknown => {
    const uuid = '00000000-0000-4000-8000-000000000001';
    switch (f.value_type) {
      case 'text': return 'x';
      case 'enum': return f.enum_values?.[0] ?? 'x';
      case 'integer': return 1;
      case 'number': return 1.5;
      case 'boolean': return true;
      case 'date': return relative ? { relative_days: -1 } : '2026-01-01';
      case 'timestamp': return relative ? { relative_days: -1 } : '2026-01-01T00:00:00Z';
      default: return uuid;
    }
  };
  const valueFor = (f: CatalogField, op: string, relative: boolean): unknown => {
    if (op === 'is_null') return true;
    if (op === 'in' || op === 'nin') return [sample(f, relative)];
    if (op === 'between') return [sample(f, relative), sample(f, relative)];
    return sample(f, relative);
  };

  it('should translate every field and operator into a where Hasura accepts', async () => {
    const w = await segmentWorld();
    const ctx = { at: new Date().toISOString(), localDate: '2026-10-19', dayStart: '2026-10-19T00:00:00Z', dayEnd: '2026-10-20T00:00:00Z', onShiftScheduleIds: [] };
    for (const target of ['profiles', 'identities'] as SegmentTarget[]) {
      const { segment_fields: catalog } = await w.a.request<{ segment_fields: CatalogField[] }>(
        `query($t: String!) { segment_fields(args: {p_target: $t}) { field value_type operators enum_values } }`,
        { t: target },
      );
      const leaves = catalog.flatMap((f) =>
        f.operators.flatMap((op) => [false, true].map((relative) => ({ field: f.field, operator: op, value: valueFor(f, op, relative) }))),
      );
      expect(leaves.length).toBeGreaterThan(40);
      const where = segmentWhere(target, { op: 'or', children: leaves.slice(0, 100) }, catalog, ctx, w.orgA.id);
      const rest = segmentWhere(target, { op: 'or', children: leaves.slice(100) }, catalog, ctx, w.orgA.id);
      for (const w2 of leaves.length > 100 ? [where, rest] : [where]) {
        await w.a.request(`query($w: ${target}_bool_exp!) { ${target}_aggregate(where: $w) { aggregate { count } } }`, { w: w2 });
      }
    }
  });
});

describe('membership locks and merges (task 1 carry-overs)', () => {
  it('should pin a target rule member when a merge folds a manual membership onto it, and roll back exactly', async () => {
    const w = await segmentWorld();
    const actor = asActor(w.orgA.id, w.user.id);
    const target = w.identity;
    const source = await createIdentity(w.a);
    const segment = await dynamicSegment(w.a, 'identities', { field: 'detection_count', operator: 'gte', value: 0 });
    await syncMembers(actor, segment.id, [target], at(0));
    await addMembers(w.a, segment.id, [source]);
    const before = await exactRows(segment.id);
    const merge = await mergeInto(w.a, target, [source]);
    expect(await openRows(segment.id)).toEqual([[target, 'manual']]);
    // A later evaluation that no longer matches the target keeps the folded manual row.
    await syncMembers(actor, segment.id, [], at(DAY));
    expect(await openRows(segment.id)).toEqual([[target, 'manual']]);
    await w.a.request(`mutation($id: uuid!) { rollback_merge(args: {p_merge_id: $id}) { id } }`, { id: merge });
    // Rollback drops the folded manual row and reopens both closed rows (source manual, target rule).
    expect(await exactRows(segment.id)).toEqual(before);
  });

  it('should pin or fold cleanly when an evaluation closes the target rule row during a merge', async () => {
    const w = await segmentWorld();
    const actor = asActor(w.orgA.id, w.user.id);
    const segment = await dynamicSegment(w.a, 'identities', { field: 'detection_count', operator: 'gte', value: 0 });
    for (let round = 0; round < 5; round += 1) {
      const target = await createIdentity(w.a);
      const source = await createIdentity(w.a);
      await syncMembers(actor, segment.id, [target], new Date(Date.now() + round * 2000).toISOString());
      await addMembers(w.a, segment.id, [source]);
      const [merge] = await Promise.all([
        mergeInto(w.a, target, [source]),
        syncMembers(actor, segment.id, [], new Date(Date.now() + round * 2000 + 1000).toISOString()),
      ]);
      expect((await openRows(segment.id)).filter(([s]) => s === target || s === source)).toEqual([[target, 'manual']]);
      const moves = await runSqlRows(
        `SELECT count(*) FILTER (WHERE row_id IS NULL) AS missing FROM itap.identity_merge_moves WHERE merge_id = '${merge}'`,
      );
      expect(moves[0].missing).toBe('0');
    }
  });

  it('should not deadlock or add merged identities when manual adds race with merges', async () => {
    const w = await segmentWorld();
    const segment = await manualSegment(w.a, 'identities');
    for (let round = 0; round < 5; round += 1) {
      const target = await createIdentity(w.a);
      const source = await createIdentity(w.a);
      await addMembers(w.a, segment.id, [source]);
      const results = await Promise.allSettled([mergeInto(w.a, target, [source]), addMembers(w.a, segment.id, [source, target])]);
      for (const r of results) {
        if (r.status === 'rejected') expect(String(r.reason)).toMatch(/identity_merged/);
      }
      const open = await openRows(segment.id);
      expect(open.some(([s]) => s === source)).toBe(false);
      expect(open.some(([s]) => s === target)).toBe(true);
    }
  });
});
