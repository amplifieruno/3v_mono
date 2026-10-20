import { beforeAll, describe, expect, it } from 'vitest';
import { faceIdentity } from './support/authDecide.js';
import { requireBackend } from './support/backend.js';
import { asOrgAdmin } from './support/clients.js';
import { sqlBool, sqlHold, sqlIds, sqlValue } from './support/compliance.js';
import { axis } from './support/faces.js';
import { createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';
import { deleteByPk, insertOne, updateByPk } from './support/operations.js';
import { createProfile, mergeInto } from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';

/** Fix round 1 of slice 10 task 1: holds follow merges, hold targets, retention floors, integrations. */

beforeAll(requireBackend);

describe('legal holds follow completed merges', () => {
  it('should hold merge sources through the effective identity and the other way round', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profileB = await createProfile(a);
    const idA = await faceIdentity(orgA.id, [axis(60)]);
    const idB = await faceIdentity(orgA.id, [axis(61)], { profile: profileB });
    const idC = await faceIdentity(orgA.id, [axis(62)]);
    await mergeInto(a, idB, [idA]);
    const covers = (id: string): Promise<boolean> => sqlBool(`itap.legal_hold_covers_identity('${orgA.id}', '${id}', now())`);

    const hold = await sqlHold(orgA.id, { profile_id: profileB });
    expect(await covers(idA)).toBe(true);
    expect(await covers(idC)).toBe(false);
    expect(await sqlIds(`itap.held_identity_ids('${orgA.id}', now())`)).toEqual([idA, idB].sort());
    // End the hold (an ended hold covers nothing now).
    await runSql(`update itap.legal_holds set ends_at = now() where id = '${hold}'`);
    expect(await covers(idA)).toBe(false);

    await sqlHold(orgA.id, { identity_id: idA });
    expect(await covers(idB)).toBe(true);
    expect(await sqlBool(`itap.legal_hold_covers_profile('${orgA.id}', '${profileB}', now())`)).toBe(true);
    expect(await sqlIds(`itap.held_profile_ids('${orgA.id}', now())`)).toEqual([profileB]);
  });

  it('should refuse deleting targets of an active hold (legal_hold_active) but allow ended ones', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await createProfile(a);
    const hold = await insertOne<{ id: string; targets: { id: string }[] }>(
      a, 'legal_holds', { name: 'Case', reason: 'Litigation', targets: { data: [{ profile_id: profile }] } }, 'id targets { id }',
    );
    const target = hold.targets[0].id;
    expect((await expectError(deleteByPk(a, 'legal_hold_targets', target))).message).toContain('legal_hold_active');
    // Ending "in the past" ends it now (clamped), never retroactively.
    const before = Date.now() - 2000;
    const ended = await updateByPk<{ ends_at: string }>(a, 'legal_holds', hold.id, { ends_at: '2020-01-01T00:00:00Z' }, 'ends_at');
    expect(new Date(String(ended?.ends_at)).getTime()).toBeGreaterThan(before);
    await deleteByPk(a, 'legal_hold_targets', target);
  });

  it('should keep the hold timeline one-way: no moved start, no extension, no reactivation', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await createProfile(a);
    const hold = await sqlHold(orgA.id, { profile_id: profile }, { starts: `now() - interval '1 day'`, ends: `now() + interval '10 days'` });
    const update = (set: string): Promise<void> => runSql(`update itap.legal_holds set ${set} where id = '${hold}'`);
    await expect(update(`starts_at = now() + interval '1 hour'`)).rejects.toThrow(/legal_hold_start_immutable/);
    await expect(update(`ends_at = now() + interval '20 days'`)).rejects.toThrow(/legal_hold_end_extension/);
    await expect(update(`ends_at = null`)).rejects.toThrow(/legal_hold_end_extension/);
    await update(`ends_at = now() + interval '5 days'`);
    await update(`name = 'Renamed'`);
    await update(`ends_at = now()`);
    // Ended: the dates are frozen, so the hold cannot come back (old workaround: move the period).
    await expect(update(`ends_at = null`)).rejects.toThrow(/legal_hold_ended/);
    await expect(update(`ends_at = now() + interval '1 day'`)).rejects.toThrow(/legal_hold_ended/);
    await expect(update(`starts_at = now() - interval '2 days'`)).rejects.toThrow(/legal_hold_start_immutable/);
    // A hold that has not started yet may still be rescheduled.
    const future = await sqlHold(orgA.id, { profile_id: profile }, { starts: `now() + interval '1 day'` });
    await runSql(`update itap.legal_holds set starts_at = now() + interval '2 days' where id = '${future}'`);
  });
});

describe('legal hold coverage closure (fixed point)', () => {
  /** A merged into B, B linked to P, C linked to P. */
  async function world() {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await createProfile(a);
    const idA = await faceIdentity(orgA.id, [axis(70)]);
    const idB = await faceIdentity(orgA.id, [axis(71)], { profile });
    const idC = await faceIdentity(orgA.id, [axis(72)], { profile });
    const idD = await faceIdentity(orgA.id, [axis(73)]);
    await mergeInto(a, idB, [idA]);
    const covers = (id: string): Promise<boolean> => sqlBool(`itap.legal_hold_covers_identity('${orgA.id}', '${id}', now())`);
    return { org: orgA.id, profile, idA, idB, idC, idD, covers };
  }

  it('should reach the other identities of the profile from a held merge source', async () => {
    const w = await world();
    await sqlHold(w.org, { identity_id: w.idA });
    expect(await w.covers(w.idC)).toBe(true);
    expect(await w.covers(w.idD)).toBe(false);
    expect(await sqlBool(`itap.legal_hold_covers_profile('${w.org}', '${w.profile}', now())`)).toBe(true);
    expect(await sqlIds(`itap.held_identity_ids('${w.org}', now())`)).toEqual([w.idA, w.idB, w.idC].sort());
    expect(await sqlIds(`itap.held_profile_ids('${w.org}', now())`)).toEqual([w.profile]);
  });

  it('should reach the merge source from another identity of the profile', async () => {
    const w = await world();
    await sqlHold(w.org, { identity_id: w.idC });
    expect(await w.covers(w.idA)).toBe(true);
    expect(await sqlIds(`itap.held_identity_ids('${w.org}', now())`)).toEqual([w.idA, w.idB, w.idC].sort());
  });
});

describe('retention classes and floors', () => {
  it('should drop trigger_logs and keep audit / auth_attempts for at least 365 days', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    expect(await sqlValue(`select count(*) from itap.retention_data_classes where value = 'trigger_logs'`)).toBe('0');
    for (const dataClass of ['audit', 'auth_attempts']) {
      expect((await expectError(insertOne(a, 'retention_policies', { data_class: dataClass, retain_days: 364, action: 'delete' }))).message).toMatch(
        /retention_policies_retain_days/,
      );
      await insertOne(a, 'retention_policies', { data_class: dataClass, retain_days: 365, action: 'delete' });
    }
    await insertOne(a, 'retention_policies', { data_class: 'detections', retain_days: 1, action: 'delete' });
  });
});

const SET_SECRET = `mutation($id: uuid!, $s: String) { set_integration_secret(integration_id: $id, secret: $s) { integration_id has_secret } }`;

describe('integrations: encrypted secret and system status', () => {
  it('should store the secret only encrypted through set_integration_secret', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const integration = await insertOne(a, 'integrations', { name: 'SIEM', kind: 'siem', provider: 'stub' });
    await expectDenied(insertOne(a, 'integrations', { name: 'X', kind: 'hr', provider: 'p', secret: 'plain' }), 'secret');
    await expectDenied(updateByPk(a, 'integrations', integration.id, { secret: 'plain' }), 'secret');
    const set = await a.request<{ set_integration_secret: { has_secret: boolean } }>(SET_SECRET, { id: integration.id, s: 'token-123' });
    expect(set.set_integration_secret.has_secret).toBe(true);
    const stored = await sqlValue(`select secret from itap.integrations where id = '${integration.id}'`);
    expect(stored).toMatch(/^v2:/);
    expect(stored).not.toContain('token-123');
    await expect(runSql(`update itap.integrations set secret = 'plain' where id = '${integration.id}'`)).rejects.toThrow(
      /integrations_secret_encrypted/,
    );
    const b = asOrgAdmin(other.id, orgB.id);
    expect((await expectError(b.request(SET_SECRET, { id: integration.id, s: 'x' }))).code).toBe('integration_not_found');
    const cleared = await a.request<{ set_integration_secret: { has_secret: boolean } }>(SET_SECRET, { id: integration.id, s: null });
    expect(cleared.set_integration_secret.has_secret).toBe(false);
  });

  it('should let org_admin edit an integration in status error without changing the status to or from error itself', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const integration = await insertOne(a, 'integrations', { name: 'BMS', kind: 'bms', provider: 'stub' });
    expect((await expectError(updateByPk(a, 'integrations', integration.id, { status: 'error' }))).message).toMatch(
      /integration_status_system_only/,
    );
    await runSql(`update itap.integrations set status = 'error', last_error = 'timeout' where id = '${integration.id}'`);
    await updateByPk(a, 'integrations', integration.id, { description: 'Retry later' });
    await updateByPk(a, 'integrations', integration.id, { status: 'paused' });
    const rows = await runSqlRows(`select status from itap.integrations where id = '${integration.id}'`);
    expect(rows).toEqual([{ status: 'paused' }]);
  });
});
