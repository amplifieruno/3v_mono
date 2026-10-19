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
    // Re-activation adds access: no urgent bump from the profile trigger.
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { status: 'active' }))).toEqual(NONE);
  });

  it('should bump on access level lowering / profile type change only when an enforced version has such a subject', async () => {
    const w = await accessWorld();
    // No enforced version with access_level / profile_type subjects: no bump.
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { access_level: 'elevated' }))).toEqual(NONE);
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { access_level: 'standard' }))).toEqual(NONE);
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { profile_type: 'contractor' }))).toEqual(NONE);
    await enforce(w, { access_level: 'standard' });
    expect(await bump(w, () => updateByPk(w.a, 'profiles', w.profile, { access_level: 'elevated' }))).toEqual(NONE);
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
    expect(await bump(w, () => addMembers(w.a, segment.id, [w.profile]))).toEqual(NONE);
    expect(await bump(w, () => removeMembers(w.a, segment.id, [w.profile]))).toEqual(URGENT_ONCE);
    const deleteRows = (id: string) => `select set_config('itap.merge_context', 'on', true);
      delete from itap.segment_members where segment_id = '${id}'`;
    expect(await bump(w, () => runSql(deleteRows(unreferenced.id)))).toEqual(NONE);
    expect(await bump(w, () => runSql(deleteRows(segment.id)))).toEqual(URGENT_ONCE);
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
