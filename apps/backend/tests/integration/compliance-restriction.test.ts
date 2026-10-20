import { describe, expect, it } from 'vitest';
import { addSegmentRows, decideWorld, faceIdentity, population } from './support/authDecide.js';
import { asOrgAdmin } from './support/clients.js';
import { setRestriction } from './support/compliance.js';
import { axis, vectorLiteral } from './support/faces.js';
import { createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';
import { insertOne, updateByPk } from './support/operations.js';
import { asActor, createProfile, dynamicSegment, evaluate, openRows, segmentWorld, syncMembers } from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';

/** Review Focus 3: processing restriction stops automated processing (recognition, auth, search, segments). */

const MATCH = `query($e: String!) { match_face(args: { p_embedding: $e, p_limit: 5 }) { identity_id } }`;

async function matchIds(client: ReturnType<typeof asOrgAdmin>, values: number[]): Promise<string[]> {
  const data = await client.request<{ match_face: { identity_id: string }[] }>(MATCH, { e: vectorLiteral(values) });
  return data.match_face.map((m) => m.identity_id);
}

const search = async (org: string, embedding: number[] | null): Promise<string[]> =>
  (
    await runSqlRows(
      `select identity_id from itap.search_identities('${org}', ${embedding ? `'${vectorLiteral(embedding)}'` : 'null'}, 0.5, 100, '{}'::jsonb)`,
    )
  ).map((r) => String(r.identity_id));

describe('processing restriction: set_processing_restriction', () => {
  it('should set and clear the restriction with reason, actor and audit rows', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await createProfile(a);
    const set = await setRestriction(a, profile, true, 'Art. 18 request DSR-00001');
    expect(set).toMatchObject({ id: profile, processing_restricted: true, restricted_by: user.id, restriction_reason: 'Art. 18 request DSR-00001' });
    expect(set.restricted_at).not.toBeNull();
    const cleared = await setRestriction(a, profile, false, 'Accuracy verified');
    expect(cleared).toMatchObject({ processing_restricted: false, restricted_at: null, restricted_by: null, restriction_reason: null });
    const audit = await runSqlRows(
      `select action, user_id, reason from itap.audit_log where entity = 'profiles' and entity_id = '${profile}'
         and action in ('restrict', 'unrestrict') order by occurred_at`,
    );
    expect(audit).toEqual([
      { action: 'restrict', user_id: user.id, reason: 'Art. 18 request DSR-00001' },
      { action: 'unrestrict', user_id: user.id, reason: 'Accuracy verified' },
    ]);
    // Reason required; foreign profile not found.
    expect((await expectError(setRestriction(a, profile, true, '  '))).message).toContain('processing_restriction_reason_required');
    const b = asOrgAdmin(other.id, orgB.id);
    expect((await expectError(setRestriction(b, profile, true))).message).toContain('profile_not_found');
  });

  it('should refuse every other way of changing the restriction columns', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await createProfile(a);
    await expectDenied(updateByPk(a, 'profiles', profile, { processing_restricted: true }), 'processing_restricted');
    await expectDenied(insertOne(a, 'profiles', { first_name: 'X', last_name: 'Y', processing_restricted: true }), 'processing_restricted');
    // Admin secret / SQL as well (only the function or the DSR job, under itap.restriction_context).
    await expect(runSql(`update itap.profiles set processing_restricted = true where id = '${profile}'`)).rejects.toThrow(
      /processing_restriction_function_only/,
    );
    await expect(
      runSql(`insert into itap.profiles (organization_id, first_name, last_name, processing_restricted)
              values ('${orgA.id}', 'A', 'B', true)`),
    ).rejects.toThrow(/processing_restriction_function_only/);
  });

  it('should refuse linking identities to or unlinking them from a restricted profile', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await createProfile(a);
    const linked = await faceIdentity(orgA.id, [axis(3)], { profile });
    const loose = await faceIdentity(orgA.id, [axis(4)]);
    await setRestriction(a, profile, true);
    await expect(runSql(`update itap.identities set profile_id = null where id = '${linked}'`)).rejects.toThrow(
      /profile_processing_restricted/,
    );
    await expect(runSql(`update itap.identities set profile_id = '${profile}' where id = '${loose}'`)).rejects.toThrow(
      /profile_processing_restricted/,
    );
    await setRestriction(a, profile, false);
    await runSql(`update itap.identities set profile_id = '${profile}' where id = '${loose}'`);
  });
});

describe('processing restriction: automated processing paths', () => {
  it('should exclude a restricted person from match_face and include them again when cleared', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await createProfile(a);
    const identity = await faceIdentity(orgA.id, [axis(10)], { profile });
    const unlinked = await faceIdentity(orgA.id, [axis(11)]);
    expect(await matchIds(a, axis(10))).toEqual([identity]);
    await setRestriction(a, profile, true);
    expect(await matchIds(a, axis(10))).toEqual([]);
    expect(await matchIds(a, axis(11))).toEqual([unlinked]);
    await setRestriction(a, profile, false);
    expect(await matchIds(a, axis(10))).toEqual([identity]);
  });

  it('should exclude a restricted person from the face auth population', async () => {
    const w = await decideWorld();
    expect(await population(w.org, w.app.id)).toEqual([w.person]);
    await setRestriction(w.a, w.profile, true);
    expect(await population(w.org, w.app.id)).toEqual([]);
    await setRestriction(w.a, w.profile, false);
    // The restriction closed the profile's manual membership of the bound segment: membership is re-granted.
    expect(await population(w.org, w.app.id)).toEqual([]);
    await addSegmentRows(w.org, w.segment.id, 'profiles', [w.profile]);
    expect(await population(w.org, w.app.id)).toEqual([w.person]);
  });

  it('should exclude a restricted person from facial and attribute search', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await createProfile(a);
    const identity = await faceIdentity(orgA.id, [axis(20)], { profile });
    expect(await search(orgA.id, axis(20))).toEqual([identity]);
    await setRestriction(a, profile, true);
    expect(await search(orgA.id, axis(20))).toEqual([]);
    expect(await search(orgA.id, null)).not.toContain(identity);
    await setRestriction(a, profile, false);
    expect(await search(orgA.id, axis(20))).toEqual([identity]);
    expect(await search(orgA.id, null)).toContain(identity);
  });

  it('should keep a restricted person out of dynamic segments (evaluation and sync) until cleared', async () => {
    const w = await segmentWorld();
    const profile = await createProfile(w.a, { department: 'Restricted Ops' });
    const identity = await faceIdentity(w.orgA.id, [axis(31)], { profile });
    const profiles = await dynamicSegment(w.a, 'profiles', { field: 'department', operator: 'eq', value: 'Restricted Ops' });
    const identities = await dynamicSegment(w.a, 'identities', { field: 'detection_count', operator: 'gte', value: 0 });
    const members = async (segment: string): Promise<(string | null)[]> => (await openRows(segment)).map(([id]) => id);

    await evaluate(w.a, profiles.id);
    await evaluate(w.a, identities.id);
    expect(await members(profiles.id)).toEqual([profile]);
    expect(await members(identities.id)).toContain(identity);

    await setRestriction(w.a, profile, true);
    await evaluate(w.a, profiles.id);
    await evaluate(w.a, identities.id);
    expect(await members(profiles.id)).toEqual([]);
    expect(await members(identities.id)).not.toContain(identity);
    // A stale or hand-built id list cannot add them either.
    const actor = asActor(w.orgA.id, w.user.id);
    // (Sync at the current time: a later evaluation must not be stale.)
    await syncMembers(actor, profiles.id, [profile], new Date().toISOString());
    await syncMembers(actor, identities.id, [w.identity, identity], new Date().toISOString());
    expect(await members(profiles.id)).toEqual([]);
    expect(await members(identities.id)).not.toContain(identity);

    await setRestriction(w.a, profile, false);
    await evaluate(w.a, profiles.id);
    await evaluate(w.a, identities.id);
    expect(await members(profiles.id)).toEqual([profile]);
    expect(await members(identities.id)).toContain(identity);
  });
});
