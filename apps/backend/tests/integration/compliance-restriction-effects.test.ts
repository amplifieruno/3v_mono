import { describe, expect, it } from 'vitest';
import { faceIdentity } from './support/authDecide.js';
import { asOrgAdmin } from './support/clients.js';
import { setRestriction } from './support/compliance.js';
import { axis, vectorLiteral } from './support/faces.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import { addMembers, createProfile, manualSegment, openRows } from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';
import { at, createTrackingWorld, detect, sessions } from './support/tracking.js';

/** Fix round 1: restriction side effects, the Stage A backstop and match_face_suppressed. */

const suppressed = async (org: string, values: number[], threshold = 0.5): Promise<number | null> => {
  const rows = await runSqlRows(
    `select similarity from itap.match_face_suppressed('{"x-hasura-organization-id":"${org}"}'::json, '${vectorLiteral(values)}', ${threshold})`,
  );
  return rows.length === 0 ? null : Number(rows[0].similarity);
};

describe('restriction side effects', () => {
  it('should close manual memberships, refuse manual adds and close open sessions of the person', async () => {
    const w = await createTrackingWorld();
    const profile = await createProfile(w.a);
    await runSql(`update itap.identities set profile_id = '${profile}' where id = '${w.identity}'`);
    const profiles = await manualSegment(w.a, 'profiles');
    const identities = await manualSegment(w.a, 'identities');
    await addMembers(w.a, profiles.id, [profile]);
    await addMembers(w.a, identities.id, [w.identity]);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 10);
    expect((await sessions(w.identity)).map((s) => s.status)).toEqual(['active']);

    await setRestriction(w.a, profile, true);
    expect(await openRows(profiles.id)).toEqual([]);
    expect(await openRows(identities.id)).toEqual([]);
    const closed = await runSqlRows(`select removed_by from itap.segment_members where segment_id = '${profiles.id}'`);
    expect(closed).toEqual([{ removed_by: w.user.id }]);
    expect((await sessions(w.identity)).map((s) => s.status)).not.toContain('active');
    expect((await expectError(addMembers(w.a, profiles.id, [profile]))).message).toContain('subject_restricted');
    expect((await expectError(addMembers(w.a, identities.id, [w.identity]))).message).toContain('subject_restricted');

    // Stage A backstop: no detection row for an identity of a restricted profile.
    await expect(detect(w.orgA.id, w.lobbyCam, w.identity, 20)).rejects.toThrow(/subject_restricted/);
    await setRestriction(w.a, profile, false);
    await addMembers(w.a, profiles.id, [profile]);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 30);
  });

  it('should leave restricted people out of the activity stats', async () => {
    const w = await createTrackingWorld();
    const profile = await createProfile(w.a);
    await runSql(`update itap.identities set profile_id = '${profile}' where id = '${w.identity}'`);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 10);
    const stats = async (): Promise<[number, number]> => {
      await runSql(`select itap.refresh_activity_stats('${w.orgA.id}', '${at(3600)}')`);
      const [r] = await runSqlRows(
        `select (select count(*) from itap.profile_activity_stats where profile_id = '${profile}') as p,
                (select count(*) from itap.identity_activity_stats where identity_id = '${w.identity}') as i`,
      );
      return [Number(r.p), Number(r.i)];
    };
    expect(await stats()).toEqual([1, 1]);
    await setRestriction(w.a, profile, true);
    expect(await stats()).toEqual([0, 0]);
    await setRestriction(w.a, profile, false);
    expect(await stats()).toEqual([1, 1]);
  });

  it('should restore an outer restriction context instead of switching it off', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await createProfile(a);
    const [row] = await runSqlRows(
      `select set_config('itap.restriction_context', 'on', true) as s,
              (itap.apply_processing_restriction('${orgA.id}', '${profile}', true, 'DSR', null)).id as id,
              current_setting('itap.restriction_context', true) as after`,
    );
    expect(row.after).toBe('on');
  });
});

describe('match_face_suppressed', () => {
  it('should report the best match among restricted and consent-withdrawn identities only', async () => {
    const { orgA, orgB, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await createProfile(a);
    await faceIdentity(orgA.id, [axis(40)], { profile });
    await faceIdentity(orgA.id, [axis(41)], { matching: false });
    await faceIdentity(orgA.id, [axis(42)]);
    expect(await suppressed(orgA.id, axis(40))).toBeNull();
    expect(await suppressed(orgA.id, axis(41))).toBeCloseTo(1, 5);
    expect(await suppressed(orgA.id, axis(42))).toBeNull();
    await setRestriction(a, profile, true);
    expect(await suppressed(orgA.id, axis(40))).toBeCloseTo(1, 5);
    expect(await suppressed(orgB.id, axis(40))).toBeNull();
    // Threshold = the maximum cosine distance, like match_face.
    expect(await suppressed(orgA.id, axis(43))).toBeNull();
  });
});
