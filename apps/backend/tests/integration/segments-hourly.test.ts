import { describe, expect, it } from 'vitest';
import { insertOne, updateByPk } from './support/operations.js';
import { dailyStats, evaluationStatus, fromNow, runHourly, runPending } from './support/segmentCrons.js';
import {
  createProfile,
  dynamicSegment,
  evaluate,
  exactRows,
  memberCount,
  openRows,
  segmentWorld,
} from './support/segments.js';
import { runSqlRows } from './support/sql.js';
import { at, detect } from './support/tracking.js';

/**
 * Hourly cron evaluate_segments (slice 6, task 3): per organization refresh_activity_stats(org, at), evaluate every
 * dynamic segment at the scheduled time, upsert segment_daily_stats; a failing segment is recorded and skipped.
 */

describe('evaluate_segments (hourly)', () => {
  it('should refresh stats, evaluate behavioral segments and write daily stats, idempotently for one scheduled time', async () => {
    const w = await segmentWorld();
    await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    const frequent = await dynamicSegment(w.a, 'identities', { field: 'visits_last_30d', operator: 'gte', value: 1 });
    const hour = at(3600);

    expect(await runHourly([w.orgA.id], hour)).toMatchObject({ organizations: 1, segments: 1, failed: 0 });
    const [stats] = await runSqlRows(`SELECT visits_last_30d, as_of FROM itap.identity_activity_stats WHERE identity_id = '${w.identity}'`);
    expect(stats.visits_last_30d).toBe('1');
    expect(Date.parse(String(stats.as_of))).toBe(Date.parse(hour));
    expect(await openRows(frequent.id)).toEqual([[w.identity, 'rule']]);
    expect((await evaluationStatus(frequent.id)).last_evaluated_at).not.toBeNull();
    expect(await dailyStats(frequent.id)).toEqual([{ day: '2026-01-05', member_count: 1, added: 1, removed: 0 }]);

    // The same scheduled time again (a Hasura retry): no new rows, same numbers.
    const rows = await exactRows(frequent.id);
    expect(await runHourly([w.orgA.id], hour)).toMatchObject({ organizations: 1, failed: 0 });
    expect(await exactRows(frequent.id)).toEqual(rows);
    expect(await dailyStats(frequent.id)).toEqual([{ day: '2026-01-05', member_count: 1, added: 1, removed: 0 }]);

    // 31 days later the visit left the window: removed, and the new day gets its own row.
    const later = new Date(Date.parse(hour) + 31 * 86_400_000).toISOString();
    await runHourly([w.orgA.id], later);
    expect(await openRows(frequent.id)).toEqual([]);
    expect(await dailyStats(frequent.id)).toEqual([
      { day: '2026-01-05', member_count: 1, added: 1, removed: 0 },
      { day: '2026-02-05', member_count: 0, added: 0, removed: 1 },
    ]);
  });

  it('should record a failing segment, keep evaluating the others and clear the failure after a success', async () => {
    const w = await segmentWorld();
    const key = `badge_${Date.now()}`;
    const definition = await insertOne(w.a, 'custom_attribute_definitions', { entity: 'profile', key, label: 'Badge', data_type: 'string' });
    const dept = `Hourly-${Date.now()}`;
    const person = await createProfile(w.a, { department: dept, custom_fields: { [key]: 'red' } });
    const broken = await dynamicSegment(w.a, 'profiles', { field: `custom_fields.${key}`, operator: 'eq', value: 'red' });
    const healthy = await dynamicSegment(w.a, 'profiles', { field: 'department', operator: 'eq', value: dept });
    // The custom field is retired: the stored condition no longer translates.
    await updateByPk(w.a, 'custom_attribute_definitions', definition.id, { is_active: false });

    const first = fromNow(31);
    expect(await runHourly([w.orgA.id], first)).toMatchObject({ organizations: 1, segments: 2, failed: 1 });
    const failed = await evaluationStatus(broken.id);
    expect(failed.last_evaluation_error).toMatch(/^segment_condition_invalid/);
    expect(Date.parse(String(failed.last_evaluation_failed_at))).toBe(Date.parse(first));
    expect(failed.last_evaluated_at).toBeNull();
    expect(await openRows(healthy.id)).toEqual([[person, 'rule']]);
    expect((await evaluationStatus(healthy.id)).last_evaluation_error).toBeNull();

    await updateByPk(w.a, 'custom_attribute_definitions', definition.id, { is_active: true });
    expect(await runHourly([w.orgA.id], fromNow(3600))).toMatchObject({ failed: 0 });
    expect(await evaluationStatus(broken.id)).toMatchObject({ last_evaluation_error: null, last_evaluation_failed_at: null });
    expect(await openRows(broken.id)).toEqual([[person, 'rule']]);
  });

  it('should leave exact membership when crons and evaluate_segment actions overlap (Review Focus 2)', async () => {
    const w = await segmentWorld();
    const dept = `Overlap-${Date.now()}`;
    const ids = await Promise.all([1, 2, 3, 4].map(() => createProfile(w.a, { department: dept })));
    const segment = await dynamicSegment(w.a, 'profiles', { field: 'department', operator: 'eq', value: dept });
    const now = new Date().toISOString();
    await Promise.all([
      runHourly([w.orgA.id], now),
      evaluate(w.a, segment.id),
      runPending([w.orgA.id], fromNow(31)),
      evaluate(w.a, segment.id),
      runHourly([w.orgA.id], now),
    ]);
    expect(await openRows(segment.id)).toEqual([...ids].sort().map((id) => [id, 'rule']));
    expect(await exactRows(segment.id)).toHaveLength(4);
    expect(await memberCount(segment.id)).toBe(4);
    const [dup] = await runSqlRows(
      `SELECT count(*) AS n FROM (SELECT profile_id FROM itap.segment_members WHERE segment_id = '${segment.id}'
       AND removed_at IS NULL GROUP BY profile_id HAVING count(*) > 1) d`,
    );
    expect(dup.n).toBe('0');
  });
});
