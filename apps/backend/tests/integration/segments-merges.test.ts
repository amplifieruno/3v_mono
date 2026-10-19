import { describe, expect, it } from 'vitest';
import { expectError } from './support/fixtures.js';
import {
  addMembers,
  createProfile,
  dynamicSegment,
  exactRows,
  insertRuleRows,
  manualSegment,
  memberCount,
  mergeInto,
  rollbackMerge,
  segmentWorld,
} from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';
import { at, createIdentity, detect } from './support/tracking.js';

const DAY = 86400;

describe('segment membership and identity merges', () => {
  it('should fold open manual memberships onto the merge target and restore them exactly on rollback', async () => {
    const w = await segmentWorld();
    const target = w.identity;
    const source = await createIdentity(w.a);
    const onlySource = await manualSegment(w.a, 'identities');
    const both = await manualSegment(w.a, 'identities');
    const rules = await dynamicSegment(w.a, 'identities', { field: 'detection_count', operator: 'gte', value: 0 });
    await addMembers(w.a, onlySource.id, [source]);
    await addMembers(w.a, both.id, [source, target]);
    await insertRuleRows(w.orgA.id, rules.id, 'identity_id', [source]);
    const before = await Promise.all([onlySource, both, rules].map((s) => exactRows(s.id)));
    const merge = await mergeInto(w.a, target, [source]);
    const open = async (segment: string) =>
      (await runSqlRows(
        `SELECT coalesce(identity_id, profile_id) AS subject, source FROM itap.segment_members
         WHERE segment_id = '${segment}' AND removed_at IS NULL ORDER BY subject`,
      )).map((r) => [r.subject, r.source]);
    expect(await open(onlySource.id)).toEqual([[target, 'manual']]);
    expect(await open(both.id)).toEqual([[target, 'manual']]);
    // Rule rows are the evaluator's business (it skips merged identities).
    expect(await open(rules.id)).toEqual([[source, 'rule']]);
    expect([await memberCount(onlySource.id), await memberCount(both.id)]).toEqual([1, 1]);
    // A merged identity cannot be added by hand.
    expect((await expectError(addMembers(w.a, both.id, [source]))).message).toMatch(/identity_merged/);
    await rollbackMerge(w.a, merge);
    const after = await Promise.all([onlySource, both, rules].map((s) => exactRows(s.id)));
    expect(after).toEqual(before);
    expect([await memberCount(onlySource.id), await memberCount(both.id)]).toEqual([1, 2]);
  });
});

describe('activity stats and identity merges', () => {
  it('should count the history of merged identities toward the target and its profile', async () => {
    const w = await segmentWorld();
    const profile = await createProfile(w.a);
    const source = await createIdentity(w.a);
    await runSql(`UPDATE itap.identities SET profile_id = '${profile}' WHERE id = '${w.identity}'`);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 120);
    await detect(w.orgA.id, w.lobbyCam, source, DAY);
    await detect(w.orgA.id, w.lobbyCam, source, DAY + 240);
    const refresh = () => runSql(`SELECT itap.refresh_activity_stats('${w.orgA.id}', '${at(3 * DAY)}')`);
    await refresh();
    const [{ n }] = await runSqlRows(`SELECT count(*) AS n FROM itap.identity_activity_stats WHERE organization_id = '${w.orgA.id}'`);
    expect(n).toBe('2');
    // After the merge the source's stale row goes and its history counts for the target.
    await mergeInto(w.a, w.identity, [source]);
    await runSql(`SELECT itap.refresh_activity_stats('${w.orgA.id}', '${at(3 * DAY)}')`);
    const ids = await runSqlRows(
      `SELECT identity_id, visits_last_30d, avg_dwell_minutes FROM itap.identity_activity_stats WHERE organization_id = '${w.orgA.id}'`,
    );
    expect(ids).toEqual([{ identity_id: w.identity, visits_last_30d: '2', avg_dwell_minutes: '3.00' }]);
    const profiles = await runSqlRows(
      `SELECT profile_id, visits_last_30d FROM itap.profile_activity_stats WHERE organization_id = '${w.orgA.id}'`,
    );
    expect(profiles).toEqual([{ profile_id: profile, visits_last_30d: '2' }]);
  });
});
