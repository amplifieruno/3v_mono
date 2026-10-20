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
    await runSql(`update itap.legal_holds set ends_at = now() - interval '1 second', starts_at = now() - interval '1 day' where id = '${hold}'`);
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
    await updateByPk(a, 'legal_holds', hold.id, { starts_at: new Date(Date.now() - 86_400_000).toISOString(), ends_at: new Date(Date.now() - 1000).toISOString() });
    await deleteByPk(a, 'legal_hold_targets', target);
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
