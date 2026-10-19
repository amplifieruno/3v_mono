import { describe, expect, it } from 'vitest';
import { policyEpoch } from './support/access.js';
import { insertGrant, publishPolicy } from './support/accessEngine.js';
import {
  ageUrgentEpoch,
  deviceSync,
  runSyncCron,
  syncLog,
  syncStatus,
  terminalPayload,
  terminalWorld,
} from './support/accessOps.js';
import { createArea } from './support/facilities.js';
import { callFn, insertOne, updateByPk } from './support/operations.js';
import { addMembers, manualSegment } from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';

/** Slice 8 task 4 fix round 1: payload person data, earliest-urgent convergence, lazy bumps, sync log on change. */

type PayloadProfile = { id: string; status: string; profile_type: string; access_level: string; identity_ids: string[] };
const profilesOf = (p: Record<string, unknown> | undefined): PayloadProfile[] =>
  ((p?.profiles as PayloadProfile[] | undefined) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));

describe('terminal payload: profiles section', () => {
  it('should carry the profiles that can match a covering subject or hold an included grant, with status and identities', async () => {
    const w = await terminalWorld();
    const visitor = (await insertOne(w.a, 'profiles', { first_name: 'Vic', last_name: 'Visitor', profile_type: 'visitor' })).id;
    const contractor = (await insertOne(w.a, 'profiles', { first_name: 'Con', last_name: 'Tractor', profile_type: 'contractor' })).id;
    const identity = (await insertOne(w.a, 'identities', { profile_id: w.profile })).id;
    await publishPolicy(w, { profile_type: 'employee' }, { access_point_id: w.door.id });
    const grant = await insertGrant(w, { profile_id: visitor });
    const p1 = await terminalPayload(w.online);
    const profiles = profilesOf(p1?.payload);
    // The employee (type subject) and the visitor (grant); the contractor matches nothing.
    expect(profiles.map((x) => x.id).sort()).toEqual([w.profile, visitor].sort());
    expect(profiles.find((x) => x.id === w.profile)).toMatchObject({ status: 'active', profile_type: 'employee', identity_ids: [identity] });
    expect(profiles.map((x) => x.id)).not.toContain(contractor);
    expect(p1?.payload.grants.map((g) => g.grant_id)).toEqual([grant]);

    // Deactivating the visitor: listed with its status, its grants dropped, checksum changed.
    await updateByPk(w.a, 'profiles', visitor, { status: 'suspended' });
    const p2 = await terminalPayload(w.online);
    expect(profilesOf(p2?.payload).find((x) => x.id === visitor)).toMatchObject({ status: 'suspended' });
    expect(p2?.payload.grants).toEqual([]);
    expect(p2?.checksum).not.toBe(p1?.checksum);
  });

  it('should carry access-level subjects by rank and segment members', async () => {
    const w = await terminalWorld();
    const high = (await insertOne(w.a, 'profiles', { first_name: 'Hi', last_name: 'Level', access_level: 'admin' })).id;
    await publishPolicy(w, { access_level: 'elevated' }, { access_point_id: w.door.id });
    const seg = await manualSegment(w.a);
    const member = (await insertOne(w.a, 'profiles', { first_name: 'Seg', last_name: 'Member', profile_type: 'vip' })).id;
    await addMembers(w.a, seg.id, [member]);
    await publishPolicy(w, { segment_id: seg.id }, { access_point_id: w.door.id });
    const ids = profilesOf((await terminalPayload(w.online))?.payload).map((x) => x.id);
    expect(ids).toContain(high);
    expect(ids).toContain(member);
    expect(ids).not.toContain(w.profile);
  });
});

describe('convergence measured from the earliest unapplied urgent epoch', () => {
  it('should measure seconds_since_urgent from the first of two urgent bumps', async () => {
    const w = await terminalWorld();
    await runSyncCron();
    const g1 = await insertGrant(w);
    const g2 = await insertGrant(w);
    await runSql(`update itap.devices set status = 'inactive' where id = '${w.online}'`);
    await callFn(w.a, 'revoke_access_grant', { p_grant: g1 }, 'id');
    await runSql(`update itap.policy_urgent_epochs set created_at = now() - interval '50 seconds'
      where organization_id = '${w.orgA.id}' and epoch = (select max(epoch) from itap.policy_urgent_epochs where organization_id = '${w.orgA.id}')`);
    await callFn(w.a, 'revoke_access_grant', { p_grant: g2 }, 'id');
    const s = (await syncStatus(w.a))[w.online];
    expect(s.urgent_pending).toBe(true);
    expect(s.seconds_since_urgent).toBeGreaterThanOrEqual(49);
    expect(s.within_bound).toBe(true);
    await ageUrgentEpoch(w.orgA.id, 15);
    expect((await syncStatus(w.a))[w.online]).toMatchObject({ within_bound: false });
  });

  it('should measure a never-synced terminal from its binding', async () => {
    const w = await terminalWorld();
    expect((await syncStatus(w.a))[w.offline]).toMatchObject({ synced_epoch: null, urgent_pending: true, within_bound: true });
    await runSql(`update itap.access_point_devices set created_at = now() - interval '120 seconds' where device_id = '${w.offline}'`);
    const s = (await syncStatus(w.a))[w.offline];
    expect(s.within_bound).toBe(false);
    expect(s.seconds_since_urgent).toBeGreaterThanOrEqual(119);
  });
});

describe('lazy bumps and the sync log', () => {
  it('should bump lazily when a person joins a segment referenced by an enforced subject (once per transaction)', async () => {
    const w = await terminalWorld();
    const seg = await manualSegment(w.a);
    const other = await manualSegment(w.a);
    await publishPolicy(w, { segment_id: seg.id }, { access_point_id: w.door.id });
    const before = await policyEpoch(w.orgA.id);
    await addMembers(w.a, other.id, [w.profile]);
    expect(await policyEpoch(w.orgA.id)).toEqual(before);
    const extra = (await insertOne(w.a, 'profiles', { first_name: 'Two', last_name: 'People' })).id;
    await addMembers(w.a, seg.id, [w.profile, extra]);
    expect(await policyEpoch(w.orgA.id)).toEqual({ epoch: before.epoch + 1, urgent: before.urgent });
  });

  it('should bump lazily on an access point status, direction or area change', async () => {
    const w = await terminalWorld();
    const other = await createArea(w.a, w.facility.id, 'Hall');
    for (const set of [{ status: 'maintenance' }, { direction: 'out' }, { area_id: other.id }]) {
      const before = await policyEpoch(w.orgA.id);
      await updateByPk(w.a, 'access_points', w.door.id, set);
      expect(await policyEpoch(w.orgA.id)).toEqual({ epoch: before.epoch + 1, urgent: before.urgent });
    }
    const before = await policyEpoch(w.orgA.id);
    await updateByPk(w.a, 'access_points', w.door.id, { name: 'Renamed door' });
    expect(await policyEpoch(w.orgA.id)).toEqual(before);
  });

  it('should log an unreachable terminal only on a state change', async () => {
    const w = await terminalWorld();
    await runSyncCron();
    await runSyncCron();
    await runSyncCron();
    expect((await syncLog(w.offline)).map((l) => l.result)).toEqual(['unreachable']);
    // Reachable -> unreachable logs once more.
    await runSyncCron();
    await runSql(`update itap.devices set status = 'connection_error' where id = '${w.online}'`);
    await insertGrant(w);
    await callFn(w.a, 'revoke_access_grant', { p_grant: (await runSqlRows(`select id from itap.access_grants where organization_id = '${w.orgA.id}'`))[0].id }, 'id');
    await runSyncCron();
    await runSyncCron();
    expect((await syncLog(w.online)).map((l) => l.result)).toEqual(['synced', 'unreachable']);
    expect(await deviceSync(w.online)).toMatchObject({ error: 'unreachable' });
  });
});
