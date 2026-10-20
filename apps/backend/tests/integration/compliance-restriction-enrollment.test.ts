import { beforeAll, describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { requireBackend } from './support/backend.js';
import { setRestriction } from './support/compliance.js';
import { addIdentityPhotos, createIdentityFromPhotos, enrollFace, FACES, uploadFace } from './support/enrollment.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import { newProfile } from './support/lifecycle.js';
import { runSql, runSqlRows } from './support/sql.js';

/** Fix round 1: restricted (and consent-withdrawn) faces are never enrolled again (subject_restricted). */

// Every call runs InsightFace on CPU for each photo.
const SLOW = 120_000;

beforeAll(requireBackend);

const INSERT_CONSENT = `mutation($o: consent_records_insert_input!) { insert_consent_records_one(object: $o) { id } }`;

const identityCount = async (orgId: string): Promise<number> =>
  Number((await runSqlRows(`select count(*) as n from itap.identities where organization_id = '${orgId}'`))[0].n);

describe('enrollment of restricted subjects', () => {
  it(
    'should refuse enroll_face / add_identity_photos / create_identity_from_photos for a restricted person',
    async () => {
      const { orgA, user } = await createTwoOrgs();
      const a = asOrgAdmin(user.id, orgA.id);
      const restricted = await newProfile(user.id, orgA.id);
      const other = await newProfile(user.id, orgA.id);
      const enrolled = await enrollFace(a, restricted, [await uploadFace(orgA.id, FACES.personA1)]);
      await setRestriction(a, restricted, true);
      const before = await identityCount(orgA.id);

      // The restricted profile itself, its identity, and the same face for another profile / a new identity.
      expect((await expectError(enrollFace(a, restricted, [await uploadFace(orgA.id, FACES.personB)]))).code).toBe('subject_restricted');
      expect((await expectError(addIdentityPhotos(a, enrolled.identity_id, [await uploadFace(orgA.id, FACES.personA2)]))).code).toBe(
        'subject_restricted',
      );
      expect((await expectError(enrollFace(a, other, [await uploadFace(orgA.id, FACES.personA2)]))).code).toBe('subject_restricted');
      expect((await expectError(createIdentityFromPhotos(a, [await uploadFace(orgA.id, FACES.personA2)]))).code).toBe(
        'subject_restricted',
      );
      expect(await identityCount(orgA.id)).toBe(before);

      // Lifted: the face is an ordinary duplicate again.
      await setRestriction(a, restricted, false);
      expect((await expectError(enrollFace(a, other, [await uploadFace(orgA.id, FACES.personA2)]))).code).toBe('duplicate_identity');
    },
    SLOW,
  );

  it(
    'should refuse a new identity for the face of a person who withdrew biometric consent',
    async () => {
      const { orgA, user } = await createTwoOrgs();
      const a = asOrgAdmin(user.id, orgA.id);
      const created = await createIdentityFromPhotos(a, [await uploadFace(orgA.id, FACES.personA1)]);
      const profile = await newProfile(user.id, orgA.id);
      await runSql(`update itap.identities set profile_id = '${profile}' where id = '${created.identity_id}'`);
      await a.request(INSERT_CONSENT, { o: { profile_id: profile, purpose: 'biometric_processing', status: 'withdrawn' } });
      expect((await expectError(createIdentityFromPhotos(a, [await uploadFace(orgA.id, FACES.personA2)]))).code).toBe(
        'subject_restricted',
      );
    },
    SLOW,
  );

  it('should map the SQL guards: biometric inserts and identity links of a restricted profile', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const profile = await newProfile(user.id, orgA.id);
    const [identity] = await runSqlRows(
      `insert into itap.identities (organization_id, profile_id) values ('${orgA.id}', '${profile}') returning id`,
    );
    await setRestriction(a, profile, true);
    const vector = `[${[1, ...new Array<number>(511).fill(0)].join(',')}]`;
    await expect(
      runSql(`insert into itap.identity_embeddings (organization_id, identity_id, embedding, quality_score)
              values ('${orgA.id}', '${identity.id}', '${vector}', 0.9)`),
    ).rejects.toThrow(/profile_processing_restricted/);
  });
});
