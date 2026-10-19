import { describe, expect, it } from 'vitest';
import { expectDenied, expectError } from './support/fixtures.js';
import { insertOne, updateByPk } from './support/operations.js';
import {
  addMembers,
  createProfile,
  dynamicSegment,
  insertRuleRows,
  manualSegment,
  memberCount,
  memberRows,
  removeMembers,
  segmentWorld,
} from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';
import { createIdentity } from './support/tracking.js';

describe('manual segment membership', () => {
  it('should add and remove manual members through the functions, keeping history and member_count', async () => {
    const w = await segmentWorld();
    const s = await manualSegment(w.a, 'profiles');
    const [p1, p2] = [await createProfile(w.a), await createProfile(w.a)];
    const added = await addMembers(w.a, s.id, [p1, p2, p1]);
    expect(added.map((m) => [m.profile_id, m.source, m.added_by, m.target]).sort()).toEqual(
      [[p1, 'manual', w.user.id, 'profiles'], [p2, 'manual', w.user.id, 'profiles']].sort(),
    );
    expect(await memberCount(s.id)).toBe(2);
    // Idempotent: adding an active member again returns the same row.
    const again = await addMembers(w.a, s.id, [p1]);
    expect(again.map((m) => m.id)).toEqual(added.filter((m) => m.profile_id === p1).map((m) => m.id));
    expect(await memberCount(s.id)).toBe(2);
    const removed = await removeMembers(w.a, s.id, [p1]);
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ profile_id: p1, removed_by: w.user.id });
    expect(removed[0].removed_at).not.toBeNull();
    expect(await removeMembers(w.a, s.id, [p1])).toEqual([]);
    expect(await memberCount(s.id)).toBe(1);
    // Re-adding opens a new row: the closed one stays as history.
    await addMembers(w.a, s.id, [p1]);
    const rows = await memberRows(s.id);
    expect(rows.filter((r) => r.subject === p1).map((r) => r.active)).toEqual(['false', 'true']);
    expect(await memberCount(s.id)).toBe(2);
  });

  it('should reject ids of another organization or target and segments of another organization', async () => {
    const w = await segmentWorld();
    const s = await manualSegment(w.a, 'identities');
    const theirIdentity = await createIdentity(w.b);
    const profile = await createProfile(w.a);
    for (const ids of [[w.identity, theirIdentity], [profile]]) {
      expect((await expectError(addMembers(w.a, s.id, ids))).message).toMatch(/segment_member_not_found/);
    }
    expect(await memberRows(s.id)).toEqual([]);
    const theirs = await manualSegment(w.b, 'identities');
    expect((await expectError(addMembers(w.a, theirs.id, [w.identity]))).message).toMatch(/segment_not_found/);
    expect((await expectError(removeMembers(w.a, theirs.id, [w.identity]))).message).toMatch(/segment_not_found/);
    await updateByPk(w.a, 'segments', s.id, { status: 'archived' });
    expect((await expectError(addMembers(w.a, s.id, [w.identity]))).message).toMatch(/segment_archived/);
  });

  it('should never let removal or a later rule sync touch the other source', async () => {
    const w = await segmentWorld();
    const s = await dynamicSegment(w.a, 'identities', { field: 'detection_count', operator: 'gte', value: 1 });
    const [i1, i2] = [w.identity, await createIdentity(w.a)];
    await insertRuleRows(w.orgA.id, s.id, 'identity_id', [i1, i2]);
    expect(await memberCount(s.id)).toBe(2);
    // remove_segment_members closes manual rows only: rule rows are the evaluator's.
    expect(await removeMembers(w.a, s.id, [i1, i2])).toEqual([]);
    // Adding a rule member manually pins it: the rule row closes and a manual row opens at the same instant.
    await addMembers(w.a, s.id, [i1]);
    const rows = await memberRows(s.id);
    expect(rows.filter((r) => r.subject === i1).map((r) => [r.source, r.active])).toEqual([
      ['rule', 'false'],
      ['manual', 'true'],
    ]);
    const [times] = await runSqlRows(
      `SELECT (max(removed_at) FILTER (WHERE source = 'rule') = max(added_at) FILTER (WHERE source = 'manual'))::text AS same
       FROM itap.segment_members WHERE segment_id = '${s.id}' AND identity_id = '${i1}'`,
    );
    expect(times.same).toBe('true');
    expect(await memberCount(s.id)).toBe(2);
    // A rule sync closing every rule row (what task 2's sync does when nothing matches) leaves the manual member.
    await runSql(`UPDATE itap.segment_members SET removed_at = now() WHERE segment_id = '${s.id}' AND source = 'rule' AND removed_at IS NULL`);
    expect(await memberCount(s.id)).toBe(1);
    expect((await memberRows(s.id)).filter((r) => r.active === 'true').map((r) => [r.subject, r.source])).toEqual([[i1, 'manual']]);
  });
});

describe('segment_members table', () => {
  it('should be read-only for org_admin and isolated per organization', async () => {
    const w = await segmentWorld();
    const s = await manualSegment(w.a, 'identities');
    const [m] = await addMembers(w.a, s.id, [w.identity]);
    const seen = await w.a.request<{ segment_members: { id: string; segment: { id: string }; identity: { id: string } }[] }>(
      `query { segment_members { id segment { id } identity { id } } }`,
    );
    expect(seen.segment_members).toEqual([{ id: m.id, segment: { id: s.id }, identity: { id: w.identity } }]);
    await expectDenied(insertOne(w.a, 'segment_members', { segment_id: s.id, target: 'identities', identity_id: w.identity, source: 'manual' }), 'insert_segment_members_one');
    await expectDenied(updateByPk(w.a, 'segment_members', m.id, { removed_at: 'now()' }), 'update_segment_members_by_pk');
    await expectDenied(w.a.request(`mutation { delete_segment_members(where: {}) { affected_rows } }`), 'delete_segment_members');
    expect((await w.b.request<{ segment_members: unknown[] }>(`query { segment_members { id } }`)).segment_members).toEqual([]);
  });

  it('should enforce target consistency, one active row per subject and immutable history', async () => {
    const w = await segmentWorld();
    const manual = await manualSegment(w.a, 'identities');
    // Rule rows belong to dynamic segments only.
    await expect(insertRuleRows(w.orgA.id, manual.id, 'identity_id', [w.identity])).rejects.toThrow(/segment_member_rule_on_manual/);
    const s = await dynamicSegment(w.a, 'identities', { field: 'detection_count', operator: 'gte', value: 0 });
    const profile = await createProfile(w.a);
    const insert = (cols: string, vals: string) =>
      runSql(`INSERT INTO itap.segment_members (organization_id, segment_id, ${cols}, source) VALUES ('${w.orgA.id}', '${s.id}', ${vals}, 'rule')`);
    await expect(insert('target, profile_id', `'profiles', '${profile}'`)).rejects.toThrow(/segment_members_segment_fkey/);
    await expect(insert('target, profile_id', `'identities', '${profile}'`)).rejects.toThrow(/segment_members_subject_matches_target/);
    await expect(insert('target, identity_id, profile_id', `'identities', '${w.identity}', '${profile}'`)).rejects.toThrow(
      /segment_members_subject_matches_target/,
    );
    await insert('target, identity_id', `'identities', '${w.identity}'`);
    await expect(insert('target, identity_id', `'identities', '${w.identity}'`)).rejects.toThrow(/segment_members_active_identity_key/);
    await expect(runSql(`UPDATE itap.segment_members SET source = 'manual' WHERE segment_id = '${s.id}'`)).rejects.toThrow(
      /segment_member_immutable/,
    );
    await runSql(`UPDATE itap.segment_members SET removed_at = now() WHERE segment_id = '${s.id}'`);
    await expect(runSql(`UPDATE itap.segment_members SET removed_at = NULL WHERE segment_id = '${s.id}'`)).rejects.toThrow(
      /segment_member_immutable/,
    );
    await expect(runSql(`DELETE FROM itap.segment_members WHERE segment_id = '${s.id}'`)).rejects.toThrow(/segment_member_delete_forbidden/);
  });

  it('should keep member_count exact for multi-row statements', async () => {
    const w = await segmentWorld();
    const rule = { field: 'detection_count', operator: 'gte', value: 0 };
    const s = await dynamicSegment(w.a, 'identities', rule);
    const other = await dynamicSegment(w.a, 'identities', rule);
    const ids = [w.identity, await createIdentity(w.a), await createIdentity(w.a)];
    await insertRuleRows(w.orgA.id, s.id, 'identity_id', ids);
    await insertRuleRows(w.orgA.id, other.id, 'identity_id', ids.slice(0, 1));
    expect([await memberCount(s.id), await memberCount(other.id)]).toEqual([3, 1]);
    await runSql(`UPDATE itap.segment_members SET removed_at = now() WHERE identity_id IN ('${ids[0]}', '${ids[1]}')`);
    expect([await memberCount(s.id), await memberCount(other.id)]).toEqual([1, 0]);
    // Closing an already-closed row changes nothing.
    await runSql(`UPDATE itap.segment_members SET removed_at = removed_at WHERE segment_id = '${s.id}'`);
    expect(await memberCount(s.id)).toBe(1);
    // A segment with membership history or daily stats is archived, not deleted; one without history can go.
    await expect(runSql(`DELETE FROM itap.segments WHERE id = '${other.id}'`)).rejects.toThrow(/segment_members_segment_fkey/);
    const fresh = await manualSegment(w.a, 'identities');
    await runSql(
      `INSERT INTO itap.segment_daily_stats (organization_id, segment_id, day) VALUES ('${w.orgA.id}', '${fresh.id}', '2026-01-05')`,
    );
    await expect(runSql(`DELETE FROM itap.segments WHERE id = '${fresh.id}'`)).rejects.toThrow(/segment_daily_stats_segment_fkey/);
    const empty = await manualSegment(w.a, 'identities');
    await runSql(`DELETE FROM itap.segments WHERE id = '${empty.id}'`);
  });
});
