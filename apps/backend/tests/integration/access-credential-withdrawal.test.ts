import { describe, expect, it } from 'vitest';
import {
  accessWorld,
  archivePolicy,
  createPolicyWithDraft,
  policyEpoch,
  publishVersion,
  type AccessWorld,
} from './support/access.js';
import { insertOne, updateByPk } from './support/operations.js';
import { addMembers, manualSegment, mergeInto, removeMembers, rollbackMerge } from './support/segments.js';
import { createArea } from './support/facilities.js';
import { runSql, runSqlRows } from './support/sql.js';
import { createIdentity } from './support/tracking.js';

/** Runs `change` and returns the epoch delta and whether the latest epoch became urgent. */
async function bump(w: AccessWorld, change: () => Promise<unknown>): Promise<{ delta: number; urgent: boolean }> {
  const before = await policyEpoch(w.orgA.id);
  await change();
  const after = await policyEpoch(w.orgA.id);
  return { delta: after.epoch - before.epoch, urgent: after.urgent === after.epoch && after.urgent !== before.urgent };
}

const URGENT_ONCE = { delta: 1, urgent: true };
const NONE = { delta: 0, urgent: false };
const LAZY_ONCE = { delta: 1, urgent: false };

/** Publishes (submit + approve) an allow policy for the given subject on the world's door; returns the policy id. */
async function enforce(w: AccessWorld, subject: Record<string, unknown>): Promise<string> {
  const { policy, draft } = await createPolicyWithDraft(w.a, subject, { access_point_id: w.door.id });
  await publishVersion(w, draft.id);
  return policy.id;
}

describe('credential withdrawal bumps the policy epoch (deferred, urgent)', () => {
  it('should bump once when a profile leaves active (unconditional), and not for other profile edits', async () => {
    const w = await accessWorld();
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { department: 'Ops' }))).toEqual(NONE);
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { status: 'suspended' }))).toEqual(URGENT_ONCE);
    // Re-activation adds access: a lazy bump (allow lists converge), never an urgent one.
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { status: 'active' }))).toEqual(LAZY_ONCE);
  });

  it('should bump on access level lowering / profile type change only when an enforced version has such a subject', async () => {
    const w = await accessWorld();
    // No enforced version with access_level / profile_type subjects: no bump.
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { access_level: 'elevated' }))).toEqual(NONE);
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { access_level: 'standard' }))).toEqual(NONE);
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { profile_type: 'contractor' }))).toEqual(NONE);
    await enforce(w, { access_level: 'standard' });
    // Raising the level widens access: lazy, narrowed like the withdrawal (an enforced access_level subject exists).
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { access_level: 'elevated' }))).toEqual(LAZY_ONCE);
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { access_level: 'basic' }))).toEqual(URGENT_ONCE);
    // Still no profile_type subject enforced.
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { profile_type: 'employee' }))).toEqual(NONE);
    const typePolicy = await enforce(w, { profile_type: 'employee' });
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { profile_type: 'visitor' }))).toEqual(URGENT_ONCE);
    // Archived policies do not count.
    await archivePolicy(w.a, typePolicy);
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { profile_type: 'employee' }))).toEqual(NONE);
  });

  it('should bump once per transaction and organization, also for several withdrawn profiles', async () => {
    const w = await accessWorld();
    const second = (await insertOne(w.a, 'profiles', { first_name: 'Bea', last_name: 'Second' })).id;
    expect(
      await bump(w, () =>
        runSql(`update itap.profiles set status = 'terminated' where id in ('${w.profile}', '${second}')`),
      ),
    ).toEqual(URGENT_ONCE);
    expect(await bump(w, () => runSql(`delete from itap.profiles where id = '${second}'`))).toEqual(URGENT_ONCE);
  });

  it('should bump on segment membership close / delete only for segments referenced by an enforced version', async () => {
    const w = await accessWorld();
    const unreferenced = await manualSegment(w.a);
    await addMembers(w.a, unreferenced.id, [w.profile]);
    expect(await bump(w, () => removeMembers(w.a, unreferenced.id, [w.profile]))).toEqual(NONE);
    const segment = await manualSegment(w.a);
    await enforce(w, { segment_id: segment.id });
    // Joining a referenced segment bumps lazily (fix round: allow lists converge); leaving it bumps urgently.
    expect(await bump(w, () => addMembers(w.a, segment.id, [w.profile]))).toEqual({ delta: 1, urgent: false });
    expect(await bump(w, () => removeMembers(w.a, segment.id, [w.profile]))).toEqual(URGENT_ONCE);
    const deleteRows = (id: string) => `select set_config('itap.merge_context', 'on', true);
      delete from itap.segment_members where segment_id = '${id}'`;
    expect(await bump(w, () => runSql(deleteRows(unreferenced.id)))).toEqual(NONE);
    // Retention deleting closed rows withdraws nothing; deleting an open row does.
    const closedOnly = `select set_config('itap.merge_context', 'on', true);
      delete from itap.segment_members where segment_id = '${segment.id}' and removed_at is not null`;
    expect(await bump(w, () => runSql(closedOnly))).toEqual(NONE);
    await addMembers(w.a, segment.id, [w.profile]);
    expect(await bump(w, () => runSql(deleteRows(segment.id)))).toEqual(URGENT_ONCE);
    // A closed membership reopened (rollback of a merge) widens access again: lazy.
    await addMembers(w.a, segment.id, [w.profile]);
    await removeMembers(w.a, segment.id, [w.profile]);
    const reopen = `select set_config('itap.merge_context', 'on', true);
      update itap.segment_members set removed_at = null, removed_by = null where segment_id = '${segment.id}'`;
    expect(await bump(w, () => runSql(reopen))).toEqual(LAZY_ONCE);
  });

  it('should bump when a blacklist entry is added, not for other watch-list kinds', async () => {
    const w = await accessWorld();
    const blacklist = (await insertOne(w.a, 'watch_lists', { name: 'Banned', kind: 'blacklist' })).id;
    const vip = (await insertOne(w.a, 'watch_lists', { name: 'VIPs', kind: 'vip' })).id;
    expect(await bump(w, () => insertOne(w.a, 'watch_list_entries', { watch_list_id: vip, profile_id: w.profile }))).toEqual(NONE);
    expect(
      await bump(w, () => insertOne(w.a, 'watch_list_entries', { watch_list_id: blacklist, profile_id: w.profile })),
    ).toEqual(URGENT_ONCE);
  });
});

describe('identity links and area moves reach the terminals', () => {
  const link = (identity: string, profile: string | null) =>
    runSql(`update itap.identities set profile_id = ${profile ? `'${profile}'` : 'null'} where id = '${identity}'`);

  it('should bump lazily on a new link, urgently on unlink / relink / delete of a linked identity', async () => {
    const w = await accessWorld();
    const second = (await insertOne(w.a, 'profiles', { first_name: 'Bea', last_name: 'Second' })).id;
    const identity = await createIdentity(w.a);
    expect(await bump(w, () => link(identity, w.profile))).toEqual(LAZY_ONCE);
    expect(await bump(w, () => link(identity, second))).toEqual(URGENT_ONCE);
    expect(await bump(w, () => link(identity, null))).toEqual(URGENT_ONCE);
    const unlinked = await createIdentity(w.a);
    expect(await bump(w, () => runSql(`delete from itap.identities where id = '${unlinked}'`))).toEqual(NONE);
    await link(identity, w.profile);
    expect(await bump(w, () => runSql(`delete from itap.identities where id = '${identity}'`))).toEqual(URGENT_ONCE);
  });

  it('should bump urgently when a merge rollback takes the inherited profile away from the target', async () => {
    const w = await accessWorld();
    const target = await createIdentity(w.a);
    const source = await createIdentity(w.a);
    await link(source, w.profile);
    const merge = await bump(w, () => mergeInto(w.a, target, [source]));
    expect(merge.delta).toBeGreaterThanOrEqual(1);
    const [row] = await runSqlRows(`select id from itap.identity_merges where target_identity_id = '${target}'`);
    const before = await policyEpoch(w.orgA.id);
    await rollbackMerge(w.a, row.id ?? '');
    const after = await policyEpoch(w.orgA.id);
    // Target unlinked (urgent) and the source relinked (lazy): the urgent epoch moved inside this transaction.
    expect(after.urgent).toBeGreaterThan(before.epoch);
    expect(after.epoch - before.epoch).toBe(2);
  });

  it('should bump urgently when an area moves (path change), not on a rename', async () => {
    const w = await accessWorld();
    const parent = await createArea(w.a, w.facility.id, 'Wing B');
    expect(await bump(w, () => updateByPk(w.a, 'areas', w.area.id, { name: 'Server room 2' }))).toEqual(NONE);
    expect(await bump(w, () => updateByPk(w.a, 'areas', w.area.id, { parent_id: parent.id }))).toEqual(URGENT_ONCE);
  });
});
