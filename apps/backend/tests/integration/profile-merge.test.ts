import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { createIdentity } from './support/faces.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import { auditRows, identityState, newProfile, PROFILE_COUNT } from './support/lifecycle.js';
import { runSqlRows } from './support/sql.js';

const MERGE_PROFILES = `
  mutation($t: uuid!, $s: uuid!) {
    merge_profiles(args: { p_target: $t, p_source: $s }) { id identities_count has_face status }
  }
`;
const PROFILE_STATUS = `query($id: uuid!) { profiles_by_pk(id: $id) { status identities_count has_face } }`;

type Counts = { profiles_by_pk: { status: string; identities_count: number; has_face: boolean } };

async function insertCandidate(orgId: string, x: string, y: string, status = 'open'): Promise<void> {
  const [lo, hi] = x < y ? [x, y] : [y, x];
  await runSqlRows(
    `insert into itap.profile_duplicate_candidates (organization_id, profile_a_id, profile_b_id, similarity, reasons, status)
     values ('${orgId}', '${lo}', '${hi}', 0.9, '["email"]', '${status}')`,
  );
}

describe('merge_profiles', () => {
  it('should move live identities, recompute counts, deactivate the source and audit the caller', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const target = await newProfile(user.id, orgA.id);
    const source = await newProfile(user.id, orgA.id);
    const targetPrimary = await createIdentity(user.id, orgA.id, { profile_id: target, is_primary_for_profile: true });
    const s1 = await createIdentity(user.id, orgA.id, { profile_id: source, is_primary_for_profile: true });
    const s2 = await createIdentity(user.id, orgA.id, { profile_id: source });

    const merged = await a.request<{ merge_profiles: { id: string; identities_count: number; has_face: boolean }[] }>(
      MERGE_PROFILES,
      { t: target, s: source },
    );
    expect(merged.merge_profiles).toEqual([
      { id: target, identities_count: 3, has_face: true, status: 'active' },
    ]);
    expect(await identityState(targetPrimary.id)).toMatchObject({ profile_id: target, is_primary_for_profile: true });
    expect(await identityState(s1.id)).toMatchObject({ profile_id: target, is_primary_for_profile: false });
    expect(await identityState(s2.id)).toMatchObject({ profile_id: target, is_primary_for_profile: false });

    const src = await a.request<Counts>(PROFILE_STATUS, { id: source });
    expect(src.profiles_by_pk).toEqual({ status: 'inactive', identities_count: 0, has_face: false });
    expect((await a.request<Counts>(PROFILE_COUNT, { id: target })).profiles_by_pk).toMatchObject({ identities_count: 3 });

    const audit = await auditRows(target);
    expect(audit.filter((r) => r.action === 'merge')).toEqual([{ action: 'merge', user_id: user.id, reason: null }]);
  });

  it('should leave merged identities alone and move consents', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const target = await newProfile(user.id, orgA.id);
    const source = await newProfile(user.id, orgA.id);
    const merged = await createIdentity(user.id, orgA.id, { profile_id: source });
    // Real merge: the source identity becomes merged (profile_id NULL), the keeper inherits the profile.
    const keeper = await createIdentity(user.id, orgA.id);
    await a.request(
      `mutation($t: uuid!, $s: _uuid!) { merge_identities(args: { p_target: $t, p_sources: $s }) { id } }`,
      { t: keeper.id, s: `{${merged.id}}` },
    );
    expect(await identityState(merged.id)).toMatchObject({ status: 'merged', profile_id: null });
    // The keeper inherited the source profile, so it moves with it.
    expect(await identityState(keeper.id)).toMatchObject({ profile_id: source });

    await runSqlRows(
      `insert into itap.consent_records (organization_id, profile_id, purpose) values ('${orgA.id}', '${source}', 'tracking')`,
    );
    await a.request(MERGE_PROFILES, { t: target, s: source });
    expect(await identityState(merged.id)).toMatchObject({ status: 'merged', profile_id: null });
    expect(await identityState(keeper.id)).toMatchObject({ profile_id: target });
    const consents = await runSqlRows(`select profile_id::text from itap.consent_records where organization_id = '${orgA.id}'`);
    expect(consents).toEqual([{ profile_id: target }]);
  });

  it('should apply the moved biometric consent state to the target identities', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const target = await newProfile(user.id, orgA.id);
    const source = await newProfile(user.id, orgA.id);
    const keeper = await createIdentity(user.id, orgA.id, { profile_id: target });
    await runSqlRows(
      `insert into itap.consent_records (organization_id, profile_id, purpose, status, granted_at)
       values ('${orgA.id}', '${target}', 'biometric_processing', 'granted', now() - interval '2 days')`,
    );
    await runSqlRows(
      `insert into itap.consent_records (organization_id, profile_id, purpose, status, granted_at, withdrawn_at)
       values ('${orgA.id}', '${source}', 'biometric_processing', 'withdrawn', now() - interval '3 days', now() - interval '1 day')`,
    );
    await a.request(MERGE_PROFILES, { t: target, s: source });
    const [row] = await runSqlRows(`select matching_enabled::text as m from itap.identities where id = '${keeper.id}'`);
    expect(row.m).toBe('false');
  });

  it('should close open candidates touching the source and keep dismissed ones', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const target = await newProfile(user.id, orgA.id);
    const source = await newProfile(user.id, orgA.id);
    const third = await newProfile(user.id, orgA.id);
    const fourth = await newProfile(user.id, orgA.id);
    await insertCandidate(orgA.id, target, source);
    await insertCandidate(orgA.id, source, third);
    await insertCandidate(orgA.id, source, fourth, 'dismissed');
    await insertCandidate(orgA.id, target, third);
    await a.request(MERGE_PROFILES, { t: target, s: source });
    const rows = await runSqlRows(
      `select (profile_a_id = '${source}' or profile_b_id = '${source}')::text as touches_source, status, count(*)::text as n
       from itap.profile_duplicate_candidates where organization_id = '${orgA.id}' group by 1, 2 order by 1, 2`,
    );
    expect(rows).toEqual([
      { touches_source: 'false', status: 'open', n: '1' },
      { touches_source: 'true', status: 'dismissed', n: '1' },
      { touches_source: 'true', status: 'merged', n: '2' },
    ]);
  });

  it('should refuse same, missing and foreign profiles without changes', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const mine = await newProfile(user.id, orgA.id);
    const foreign = await newProfile(other.id, orgB.id);
    const identity = await createIdentity(other.id, orgB.id, { profile_id: foreign });

    expect((await expectError(a.request(MERGE_PROFILES, { t: mine, s: mine }))).message).toContain('merge_source_is_target');
    expect((await expectError(a.request(MERGE_PROFILES, { t: mine, s: foreign }))).message).toContain('profile_not_found');
    expect((await expectError(a.request(MERGE_PROFILES, { t: foreign, s: mine }))).message).toContain('profile_not_found');
    expect(await identityState(identity.id)).toMatchObject({ profile_id: foreign });
    expect((await a.request<Counts>(PROFILE_STATUS, { id: mine })).profiles_by_pk.status).toBe('active');
  });

  it('should not let org_admin write candidate pairs but allow dismissing one', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const p1 = await newProfile(user.id, orgA.id);
    const p2 = await newProfile(user.id, orgA.id);
    await insertCandidate(orgA.id, p1, p2);
    const dismissed = await a.request<{ update_profile_duplicate_candidates: { affected_rows: number } }>(
      `mutation { update_profile_duplicate_candidates(where: {}, _set: { status: dismissed }) { affected_rows } }`,
    );
    expect(dismissed.update_profile_duplicate_candidates.affected_rows).toBe(1);
    await expectError(a.request(`mutation { insert_profile_duplicate_candidates_one(object: {}) { id } }`));
  });
});
