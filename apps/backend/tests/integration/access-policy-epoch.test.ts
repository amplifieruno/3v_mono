import { describe, expect, it } from 'vitest';
import {
  accessWorld,
  archivePolicy,
  createDraft,
  createPolicyWithDraft,
  endOverride,
  insertOverride,
  policyEpoch,
  publishVersion,
  submitVersion,
  type AccessWorld,
  type Epoch,
} from './support/access.js';
import { expectDenied, expectError } from './support/fixtures.js';
import { callFn, insertOne, updateByPk } from './support/operations.js';
import { runSql, runSqlRows } from './support/sql.js';

const hour = (h: number): string => new Date(Date.now() + h * 3600_000).toISOString();

const doorPolicy = (w: AccessWorld, effect: 'allow' | 'deny') =>
  createPolicyWithDraft(w.a, { profile_id: w.profile }, { access_point_id: w.door.id }, { effect });

/** Runs `change` and returns the epoch delta and whether the new epoch is urgent. */
async function bump(w: AccessWorld, change: () => Promise<unknown>): Promise<{ delta: number; urgent: boolean }> {
  const before: Epoch = await policyEpoch(w.orgA.id);
  await change();
  const after = await policyEpoch(w.orgA.id);
  return { delta: after.epoch - before.epoch, urgent: after.urgent === after.epoch && after.urgent !== before.urgent };
}

describe('policy epoch (distribution)', () => {
  it('should start at 0 with the default revocation bound and expose the settings to org_admin', async () => {
    const w = await accessWorld();
    const settings = await w.a.request<{ organization_settings: Record<string, unknown>[] }>(
      `query { organization_settings { policy_epoch policy_urgent_epoch policy_revocation_bound_seconds } }`,
    );
    expect(settings.organization_settings).toEqual([{ policy_epoch: 0, policy_urgent_epoch: 0, policy_revocation_bound_seconds: 60 }]);
    await w.a.request(
      `mutation($o: uuid!) { update_organization_settings_by_pk(pk_columns: {organization_id: $o}, _set: {policy_revocation_bound_seconds: 30}) { organization_id } }`,
      { o: w.orgA.id },
    );
    await expectDenied(
      w.a.request(
        `mutation($o: uuid!) { update_organization_settings_by_pk(pk_columns: {organization_id: $o}, _set: {policy_epoch: 5}) { organization_id } }`,
        { o: w.orgA.id },
      ),
      'policy_epoch',
    );
    const tooLow = await expectError(
      w.a.request(
        `mutation($o: uuid!) { update_organization_settings_by_pk(pk_columns: {organization_id: $o}, _set: {policy_revocation_bound_seconds: 1}) { organization_id } }`,
        { o: w.orgA.id },
      ),
    );
    expect(tooLow.message).toContain('organization_settings_policy_revocation_bound_range');
  });

  it('should bump on publish: allow publish is lazy, deny publish and allow supersede are urgent', async () => {
    const w = await accessWorld();
    const allow = await doorPolicy(w, 'allow');
    // Drafting and submitting change nothing enforced.
    expect(await bump(w, () => submitVersion(w.a, allow.draft.id))).toEqual({ delta: 0, urgent: false });
    expect(await bump(w, () => w.approver.request(
      `mutation($v: uuid!) { approve_access_policy_version(args: {p_version: $v}) { id } }`, { v: allow.draft.id },
    ))).toEqual({ delta: 1, urgent: false });
    const deny = await doorPolicy(w, 'deny');
    expect(await bump(w, () => publishVersion(w, deny.draft.id))).toEqual({ delta: 1, urgent: true });
    // Replacing the allow version (allow superseded) can reduce access: urgent.
    const v2 = await createDraft(w.a, allow.policy.id);
    expect(await bump(w, () => publishVersion(w, v2.id))).toEqual({ delta: 1, urgent: true });
  });

  it('should bump on archive: urgent for an allow policy, lazy for a deny policy, none for an unpublished one', async () => {
    const w = await accessWorld();
    const allow = await doorPolicy(w, 'allow');
    await publishVersion(w, allow.draft.id);
    expect(await bump(w, () => archivePolicy(w.a, allow.policy.id))).toEqual({ delta: 1, urgent: true });
    const deny = await doorPolicy(w, 'deny');
    await publishVersion(w, deny.draft.id);
    expect(await bump(w, () => archivePolicy(w.a, deny.policy.id))).toEqual({ delta: 1, urgent: false });
    const never = await doorPolicy(w, 'allow');
    expect(await bump(w, () => archivePolicy(w.a, never.policy.id))).toEqual({ delta: 0, urgent: false });
  });

  it('should bump on grants: insert lazy, revoke urgent, consumption none', async () => {
    const w = await accessWorld();
    let id = '';
    expect(
      await bump(w, async () => {
        id = (
          await insertOne(w.a, 'access_grants', {
            profile_id: w.profile,
            area_id: w.area.id,
            valid_from: hour(-1),
            valid_until: hour(1),
            single_use: true,
          })
        ).id;
      }),
    ).toEqual({ delta: 1, urgent: false });
    expect(await bump(w, () => runSql(`update itap.access_grants set used_at = now() where id = '${id}'`))).toEqual({
      delta: 0,
      urgent: false,
    });
    expect(await bump(w, () => callFn(w.a, 'revoke_access_grant', { p_grant: id, p_reason: 'Done' }, 'id'))).toEqual({
      delta: 1,
      urgent: true,
    });
  });

  it('should bump on overrides: lock start urgent, unlock start lazy, unlock end urgent, lock end lazy', async () => {
    const w = await accessWorld();
    let lock = '';
    expect(await bump(w, async () => (lock = await insertOverride(w.orgA.id, w.facility.id, 'lock_all')))).toEqual({
      delta: 1,
      urgent: true,
    });
    expect(await bump(w, () => endOverride(lock))).toEqual({ delta: 1, urgent: false });
    let unlock = '';
    expect(await bump(w, async () => (unlock = await insertOverride(w.orgA.id, w.facility.id, 'evacuation')))).toEqual({
      delta: 1,
      urgent: false,
    });
    expect(await bump(w, () => endOverride(unlock))).toEqual({ delta: 1, urgent: true });
  });

  it('should record bump times, keep other organizations untouched and not audit the counters', async () => {
    const w = await accessWorld();
    const deny = await doorPolicy(w, 'deny');
    await publishVersion(w, deny.draft.id);
    const [row] = await runSqlRows(`select policy_epoch_at is not null as e, policy_urgent_at is not null as u
      from itap.organization_settings where organization_id = '${w.orgA.id}'`);
    expect(row).toEqual({ e: 't', u: 't' });
    expect(await policyEpoch(w.orgB.id)).toEqual({ epoch: 0, urgent: 0 });
    const audit = await runSqlRows(`select changes from itap.audit_log where entity = 'organization_settings'
      and organization_id = '${w.orgA.id}' and action = 'update'`);
    expect(audit).toEqual([]);
  });

  it('should add policy_sync_error to devices as a read-only column', async () => {
    const w = await accessWorld();
    const device = await insertOne(w.a, 'devices', { facility_id: w.facility.id, name: 'Terminal 1', device_type: 'access_terminal' });
    const seen = await w.a.request<{ devices_by_pk: Record<string, unknown> }>(
      `query($id: uuid!) { devices_by_pk(id: $id) { policy_version_synced policy_synced_at policy_sync_error } }`,
      { id: device.id },
    );
    expect(seen.devices_by_pk).toEqual({ policy_version_synced: null, policy_synced_at: null, policy_sync_error: null });
    await expectDenied(updateByPk(w.a, 'devices', device.id, { policy_sync_error: 'x' }), 'policy_sync_error');
  });
});
