import { describe, expect, it } from 'vitest';
import { accessWorld, policyEpoch, type AccessWorld } from './support/access.js';
import { insertOne, updateByPk } from './support/operations.js';
import { addMembers, manualSegment, removeMembers } from './support/segments.js';
import { runSql } from './support/sql.js';

/** Runs `change` and returns the epoch delta and whether the latest epoch became urgent. */
async function bump(w: AccessWorld, change: () => Promise<unknown>): Promise<{ delta: number; urgent: boolean }> {
  const before = await policyEpoch(w.orgA.id);
  await change();
  const after = await policyEpoch(w.orgA.id);
  return { delta: after.epoch - before.epoch, urgent: after.urgent === after.epoch && after.urgent !== before.urgent };
}

const URGENT_ONCE = { delta: 1, urgent: true };
const NONE = { delta: 0, urgent: false };

describe('credential withdrawal bumps the policy epoch (deferred, urgent)', () => {
  it('should bump once when a profile leaves active, and not for other profile edits', async () => {
    const w = await accessWorld();
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { department: 'Ops' }))).toEqual(NONE);
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { status: 'suspended' }))).toEqual(URGENT_ONCE);
    // Re-activation adds access: no urgent bump from the profile trigger.
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { status: 'active' }))).toEqual(NONE);
  });

  it('should bump when the access level is lowered or the profile type changes, not when the level is raised', async () => {
    const w = await accessWorld();
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { access_level: 'elevated' }))).toEqual(NONE);
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { access_level: 'standard' }))).toEqual(URGENT_ONCE);
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { profile_type: 'contractor' }))).toEqual(URGENT_ONCE);
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

  it('should bump when a segment membership is closed or deleted', async () => {
    const w = await accessWorld();
    const segment = await manualSegment(w.a);
    expect(await bump(w, () => addMembers(w.a, segment.id, [w.profile]))).toEqual(NONE);
    expect(await bump(w, () => removeMembers(w.a, segment.id, [w.profile]))).toEqual(URGENT_ONCE);
    const deleteRows = `select set_config('itap.merge_context', 'on', true);
      delete from itap.segment_members where segment_id = '${segment.id}'`;
    expect(await bump(w, () => runSql(deleteRows))).toEqual(URGENT_ONCE);
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
