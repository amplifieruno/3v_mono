import { describe, expect, it } from 'vitest';
import { policyEpoch } from './support/access.js';
import { insertGrant, publishPolicy } from './support/accessEngine.js';
import {
  ageUrgentEpoch,
  deviceSync,
  publishToTerminals,
  runSyncCron,
  startOverride,
  syncLog,
  syncStatus,
  terminalPayload,
  terminalWorld,
} from './support/accessOps.js';
import { createAccessPoint, createArea, createFacility } from './support/facilities.js';
import { expectDenied, expectError } from './support/fixtures.js';
import { callFn } from './support/operations.js';
import { addMembers, manualSegment } from './support/segments.js';
import { waitFor } from './support/sending.js';
import { runSql, runSqlRows } from './support/sql.js';

/** Policy distribution to access terminals (slice 8 task 4): payload, cron, action, status, Review Focus 4. */

describe('terminal_policy_payload', () => {
  it('should carry covering versions, reusable grants with their window, active overrides and never single-use grants', async () => {
    const w = await terminalWorld();
    const otherArea = await createArea(w.a, w.facility.id, 'Lobby');
    const otherDoor = await createAccessPoint(w.a, w.facility.id, otherArea.id);
    const covering = await publishPolicy(w, { profile_type: 'employee' }, { access_point_id: w.door.id });
    const facilityWide = await publishPolicy(w, { profile_id: w.profile }, { facility_id: w.facility.id }, { effect: 'deny', priority: 300 });
    await publishPolicy(w, { profile_type: 'employee' }, { access_point_id: otherDoor.id });
    const reusable = await insertGrant(w);
    const areaGrant = await insertGrant(w, { access_point_id: null, area_id: w.area.id });
    await insertGrant(w, { single_use: true });
    await insertGrant(w, { access_point_id: otherDoor.id });
    const ov = await startOverride(w.a, w.facility.id, 'lock_all', { area_ids: [w.area.id] });

    const p = await terminalPayload(w.online);
    expect(p).toBeDefined();
    if (!p) return;
    const epoch = await policyEpoch(w.orgA.id);
    expect(p).toMatchObject({ device_id: w.online, epoch: epoch.epoch, urgent_epoch: epoch.urgent });
    expect(p.payload.versions.map((v) => v.version_id)).toEqual([facilityWide.version, covering.version]);
    expect(p.payload.grants.map((g) => g.grant_id).sort()).toEqual([reusable, areaGrant].sort());
    expect(p.payload.grants[0].valid_until).toBeTruthy();
    expect(p.payload.overrides).toEqual([expect.objectContaining({ override_id: ov.id, ends_at: expect.any(String) })]);
    expect(p.payload.single_use_grants).toBe('central');
    expect(p.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(p.size_bytes).toBeGreaterThan(100);
    // Same content -> same checksum (generated_at excluded).
    expect((await terminalPayload(w.online))?.checksum).toBe(p.checksum);
    // Not a terminal: an unbound access terminal and a camera.
    expect(await terminalPayload(w.unbound)).toBeUndefined();
    expect(await terminalPayload(w.camera)).toBeUndefined();
  });

  it('should carry the open members of segment subjects', async () => {
    const w = await terminalWorld();
    const seg = await manualSegment(w.a);
    await addMembers(w.a, seg.id, [w.profile]);
    await publishPolicy(w, { segment_id: seg.id }, { access_point_id: w.door.id });
    const p = await terminalPayload(w.online);
    expect(p?.payload.segments).toEqual([{ segment_id: seg.id, target: 'profiles', member_ids: [w.profile] }]);
  });

  it('should be admin-only; org_admin sees the status and the sync log', async () => {
    const w = await terminalWorld();
    await expectDenied(w.a.request(`query { terminal_policy_payload(args: {p_device: "${w.online}"}) { checksum } }`), 'terminal_policy_payload');
    await expectDenied(
      w.a.request(`query { terminals_due_for_sync(args: {p_at: "${new Date().toISOString()}"}) { device_id } }`),
      'terminals_due_for_sync',
    );
    await expectDenied(
      w.a.request(`mutation { record_terminal_sync(args: {p_device: "${w.online}", p_epoch: 99, p_urgent: true,
        p_forced: false, p_result: "synced", p_checksum: null, p_size_bytes: null, p_duration_ms: null}) { id } }`),
      'record_terminal_sync',
    );
    const status = await syncStatus(w.a);
    expect(Object.keys(status).sort()).toEqual([w.online, w.offline].sort());
    expect(await syncStatus(w.b)).toEqual({});
    await w.a.request(`query { terminal_policy_syncs { id } }`);
  });
});

describe('record_terminal_sync', () => {
  it('should reject a synced result without a checksum or for an epoch the organization never reached', async () => {
    const w = await terminalWorld();
    const { epoch } = await policyEpoch(w.orgA.id);
    const record = (epochArg: number, checksum: string | null) =>
      runSqlRows(`select id from itap.record_terminal_sync('${w.online}', ${epochArg}, false, false, 'synced',
        ${checksum === null ? 'null' : `'${checksum}'`}, 10, 1)`);
    await expect(record(epoch, null)).rejects.toThrow(/terminal_sync_checksum_required/);
    await expect(record(epoch + 1, 'abc')).rejects.toThrow(/terminal_sync_epoch_invalid/);
    expect(await deviceSync(w.online)).toMatchObject({ synced: null });
    expect(await record(epoch, 'abc')).toHaveLength(1);
    expect(await deviceSync(w.online)).toMatchObject({ synced: epoch, error: null });
    // A failed attempt carries no checksum.
    expect(await runSqlRows(`select id from itap.record_terminal_sync('${w.online}', ${epoch}, false, false, 'failed',
      null, null, 1, 'timeout')`)).toHaveLength(1);
  });
});

describe('sync_terminal_policies (Review Focus 4)', () => {
  it('should push a revocation to every reachable terminal within the bound and report the offline one stale', async () => {
    const w = await terminalWorld();
    const grant = await insertGrant(w);
    await runSyncCron();
    const epoch0 = await policyEpoch(w.orgA.id);
    expect(await deviceSync(w.online)).toMatchObject({ synced: epoch0.epoch, error: null });
    expect(await deviceSync(w.offline)).toMatchObject({ synced: null, error: 'unreachable' });

    // Revocation: urgent epoch. Synced by the cron run (or earlier by the urgent-bump trigger), never the offline one.
    await callFn(w.a, 'revoke_access_grant', { p_grant: grant, p_reason: 'Badge lost' }, 'id');
    const epoch1 = await policyEpoch(w.orgA.id);
    expect(epoch1.urgent).toBe(epoch1.epoch);
    await runSyncCron();
    const status = await syncStatus(w.a);
    expect(status[w.online]).toMatchObject({ synced_epoch: epoch1.epoch, urgent_pending: false, within_bound: true, epoch_lag: 0 });
    expect(status[w.offline]).toMatchObject({ synced_epoch: null, urgent_pending: true, reachable: false, sync_error: 'unreachable' });
    expect(status[w.offline].within_bound).toBe(true);
    const log = await syncLog(w.online);
    expect(log.at(-1)).toMatchObject({ epoch: epoch1.epoch, urgent: true, result: 'synced' });
    expect((await syncLog(w.offline)).every((l) => l.result === 'unreachable')).toBe(true);
    // The pushed payload no longer carries the revoked grant.
    expect((await terminalPayload(w.online))?.payload.grants).toEqual([]);

    // Past the bound the offline terminal is reported out of bound; the synced one stays within.
    await ageUrgentEpoch(w.orgA.id, 120);
    const late = await syncStatus(w.a);
    expect(late[w.offline]).toMatchObject({ within_bound: false, urgent_pending: true });
    expect(late[w.offline].seconds_since_urgent).toBeGreaterThan(late[w.offline].bound_seconds);
    expect(late[w.online].within_bound).toBe(true);

    // Back online: the next run converges it.
    await runSql(`update itap.devices set status = 'active' where id = '${w.offline}'`);
    await runSyncCron();
    expect(await deviceSync(w.offline)).toMatchObject({ synced: epoch1.epoch, error: null });
  });

  it('should push a deny publish urgently without waiting for the cron (urgent-bump trigger)', async () => {
    const w = await terminalWorld();
    await runSyncCron();
    await publishPolicy(w, { profile_id: w.profile }, { access_point_id: w.door.id }, { effect: 'deny' });
    const { epoch } = await policyEpoch(w.orgA.id);
    await waitFor(() => deviceSync(w.online), (s) => s.synced === epoch, 15000);
  });

  it('should converge an allow lazily: not within 15 minutes of the last sync, then at the next run', async () => {
    const w = await terminalWorld();
    await runSyncCron();
    const synced = (await deviceSync(w.online)).synced;
    await insertGrant(w);
    const e = await policyEpoch(w.orgA.id);
    expect(e.urgent).toBeLessThan(e.epoch);
    await runSyncCron();
    expect((await deviceSync(w.online)).synced).toBe(synced);
    expect((await syncStatus(w.a))[w.online]).toMatchObject({ epoch_lag: 1, urgent_pending: false, within_bound: true });
    await runSql(`update itap.devices set policy_synced_at = now() - interval '16 minutes' where id = '${w.online}'`);
    await runSyncCron();
    expect(await deviceSync(w.online)).toMatchObject({ synced: e.epoch });
    expect((await syncLog(w.online)).at(-1)).toMatchObject({ urgent: false, result: 'synced' });
  });

  it('should be idempotent: a run with nothing due writes no log rows', async () => {
    const w = await terminalWorld();
    await runSql(`update itap.devices set status = 'inactive' where id = '${w.offline}'`);
    await runSyncCron();
    const before = (await syncLog(w.online)).length;
    await runSyncCron();
    await runSyncCron();
    expect((await syncLog(w.online)).length).toBe(before);
  });

  it('should treat a critical-health terminal as unreachable', async () => {
    const w = await terminalWorld();
    await runSql(`update itap.devices set health_status = 'critical' where id = '${w.online}'`);
    await runSyncCron();
    expect(await deviceSync(w.online)).toMatchObject({ synced: null, error: 'unreachable' });
    expect((await syncStatus(w.a))[w.online].reachable).toBe(false);
  });
});

describe('publish_policy_to_terminals', () => {
  it('should force a push to every terminal of the organization or one facility and return per-terminal results', async () => {
    const w = await terminalWorld();
    await runSyncCron();
    const before = (await syncLog(w.online)).length;
    const { epoch } = await policyEpoch(w.orgA.id);
    const results = await publishToTerminals(w.a);
    expect(results.sort((x, y) => x.device_id.localeCompare(y.device_id))).toEqual(
      [
        { device_id: w.online, result: 'synced', epoch },
        { device_id: w.offline, result: 'unreachable', epoch },
      ].sort((x, y) => x.device_id.localeCompare(y.device_id)),
    );
    expect((await syncLog(w.online)).length).toBe(before + 1);
    expect((await syncLog(w.online)).at(-1)).toMatchObject({ forced: true });

    const empty = await createFacility(w.a);
    expect(await publishToTerminals(w.a, empty.id)).toEqual([]);
    expect((await publishToTerminals(w.a, w.facility.id)).length).toBe(2);
    expect((await expectError(publishToTerminals(w.b, w.facility.id))).message).toContain('Facility not found');
  });
});
