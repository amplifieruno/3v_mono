import { describe, expect, it } from 'vitest';
import { faceIdentity } from './support/authDecide.js';
import { asOrgAdmin } from './support/clients.js';
import { sqlBool, sqlHold, sqlIds } from './support/compliance.js';
import { axis } from './support/faces.js';
import { createFacility } from './support/facilities.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import { insertOne } from './support/operations.js';
import { createIncident } from './support/operations.js';
import { createProfile } from './support/segments.js';
import { runSql } from './support/sql.js';

const NOW = 'now()';

describe('legal holds: coverage helpers', () => {
  it('should cover a held profile and its linked identities (and the profile of a held identity)', async () => {
    const { orgA, orgB, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const held = await createProfile(a);
    const free = await createProfile(a);
    const heldFace = await faceIdentity(orgA.id, [axis(1)], { profile: held });
    const viaIdentity = await createProfile(a);
    const heldIdentity = await faceIdentity(orgA.id, [axis(2)], { profile: viaIdentity });
    const loose = await faceIdentity(orgA.id, [axis(3)]);
    await sqlHold(orgA.id, { profile_id: held });
    await sqlHold(orgA.id, { identity_id: heldIdentity });

    const covers = (kind: string, id: string, org = orgA.id, at = NOW): Promise<boolean> =>
      sqlBool(`itap.legal_hold_covers_${kind}('${org}', '${id}', ${at})`);
    expect(await covers('profile', held)).toBe(true);
    expect(await covers('identity', heldFace)).toBe(true);
    expect(await covers('identity', heldIdentity)).toBe(true);
    expect(await covers('profile', viaIdentity)).toBe(true);
    expect(await covers('profile', free)).toBe(false);
    expect(await covers('identity', loose)).toBe(false);
    // Scoped to the organization.
    expect(await covers('profile', held, orgB.id)).toBe(false);

    expect(await sqlIds(`itap.held_profile_ids('${orgA.id}', now())`)).toEqual([held, viaIdentity].sort());
    expect(await sqlIds(`itap.held_identity_ids('${orgA.id}', now())`)).toEqual([heldFace, heldIdentity].sort());
    expect(await sqlIds(`itap.held_profile_ids('${orgB.id}', now())`)).toEqual([]);
  });

  it('should respect the hold period (not started, ended) and cover incidents and facilities', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await createProfile(a);
    const later = await createProfile(a);
    const facility = await createFacility(a);
    const incident = await createIncident(a);
    await sqlHold(orgA.id, { profile_id: profile }, { starts: `now() - interval '10 days'`, ends: `now() - interval '1 day'` });
    await sqlHold(orgA.id, { profile_id: later }, { starts: `now() + interval '1 day'` });
    await sqlHold(orgA.id, { incident_id: incident.id });
    await sqlHold(orgA.id, { facility_id: facility.id });

    expect(await sqlBool(`itap.legal_hold_covers_profile('${orgA.id}', '${profile}', now())`)).toBe(false);
    expect(await sqlBool(`itap.legal_hold_covers_profile('${orgA.id}', '${profile}', now() - interval '5 days')`)).toBe(true);
    expect(await sqlBool(`itap.legal_hold_covers_profile('${orgA.id}', '${later}', now())`)).toBe(false);
    expect(await sqlBool(`itap.legal_hold_covers_profile('${orgA.id}', '${later}', now() + interval '2 days')`)).toBe(true);
    expect(await sqlBool(`itap.legal_hold_covers_incident('${orgA.id}', '${incident.id}', now())`)).toBe(true);
    expect(await sqlBool(`itap.legal_hold_covers_facility('${orgA.id}', '${facility.id}', now())`)).toBe(true);
    expect(await sqlBool(`itap.legal_hold_covers_facility('${orgA.id}', '${facility.id}', now() - interval '1 day')`)).toBe(false);
  });
});

describe('legal holds: schema and permissions', () => {
  it('should let org_admin create holds with exactly one target per row and stamp created_by', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await createProfile(a);
    const hold = await insertOne<{ id: string; created_by: string; starts_at: string }>(
      a, 'legal_holds',
      { name: 'Case 42', reason: 'Pending litigation', targets: { data: [{ profile_id: profile }] } },
      'id created_by starts_at',
    );
    expect(hold.created_by).toBe(user.id);
    expect((await expectError(insertOne(a, 'legal_hold_targets', { hold_id: hold.id }))).message).toMatch(/legal_hold_targets_exactly_one/);
    const facility = await createFacility(a);
    expect(
      (await expectError(insertOne(a, 'legal_hold_targets', { hold_id: hold.id, profile_id: profile, facility_id: facility.id }))).message,
    ).toMatch(/legal_hold_targets_exactly_one/);
    expect((await expectError(insertOne(a, 'legal_holds', { name: 'Bad', reason: 'x', starts_at: '2026-01-02T00:00:00Z', ends_at: '2026-01-01T00:00:00Z' }))).message).toMatch(
      /legal_holds_period/,
    );
    // A held target cannot be deleted from under the hold (NO ACTION), and org B cannot reference A's rows.
    await expect(runSql(`delete from itap.profiles where id = '${profile}'`)).rejects.toThrow(/legal_hold_targets_profile_fkey/);
    const b = asOrgAdmin(other.id, orgB.id);
    await expectError(insertOne(b, 'legal_hold_targets', { hold_id: hold.id, profile_id: profile }));
  });
});
