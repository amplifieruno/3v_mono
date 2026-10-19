import { beforeAll, describe, expect, it } from 'vitest';
import { createStorageClient } from '../../src/storage/storageClient.js';
import { asOrgAdmin, testEnv } from './support/clients.js';
import { requireBackend } from './support/backend.js';
import { addIdentityPhotos, createIdentityFromPhotos, enrollFace, FACES, readFace, uploadFace } from './support/enrollment.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import { newProfile } from './support/lifecycle.js';
import { runSql, runSqlRows } from './support/sql.js';

// Every call runs InsightFace on CPU for each photo.
const SLOW = 90_000;

beforeAll(requireBackend);

const INSERT_CONSENT = `
  mutation($o: consent_records_insert_input!) { insert_consent_records_one(object: $o) { id } }
`;

async function identityCount(orgId: string): Promise<string> {
  const [row] = await runSqlRows(`select count(*)::text as n from itap.identities where organization_id = '${orgId}'`);
  return row.n ?? '';
}

describe('enrollment and biometric consent', () => {
  it(
    'should refuse enroll_face with consent_withdrawn when the profile withdrew biometric consent',
    async () => {
      const { orgA, user } = await createTwoOrgs();
      const a = asOrgAdmin(user.id, orgA.id);
      const profile = await newProfile(user.id, orgA.id);
      await a.request(INSERT_CONSENT, { o: { profile_id: profile, purpose: 'biometric_processing', status: 'withdrawn' } });

      const error = await expectError(enrollFace(a, profile, [await uploadFace(orgA.id, FACES.personA1)]));
      expect(error.code).toBe('consent_withdrawn');
      expect(await identityCount(orgA.id)).toBe('0');
    },
    SLOW,
  );

  it(
    'should refuse add_identity_photos with consent_withdrawn for an identity with matching disabled',
    async () => {
      const { orgA, user } = await createTwoOrgs();
      const a = asOrgAdmin(user.id, orgA.id);
      const created = await createIdentityFromPhotos(a, [await uploadFace(orgA.id, FACES.personA1)]);
      const profile = await newProfile(user.id, orgA.id);
      await a.request(INSERT_CONSENT, { o: { profile_id: profile, purpose: 'biometric_processing', status: 'withdrawn' } });
      await runSql(`update itap.identities set profile_id = '${profile}' where id = '${created.identity_id}'`);

      const error = await expectError(addIdentityPhotos(a, created.identity_id, [await uploadFace(orgA.id, FACES.personA2)]));
      expect(error.code).toBe('consent_withdrawn');
    },
    SLOW,
  );
});

describe('enrollment photo sources', () => {
  it('should answer file_not_found for a sensitive file of the organization (profile document)', async () => {
    const { orgA, user } = await createTwoOrgs();
    const profile = await newProfile(user.id, orgA.id);
    const storage = createStorageClient(testEnv());
    for (const kind of ['profile_document', 'dsr_export', 'auth_capture']) {
      const { id } = await storage.upload({
        bucketId: orgA.id,
        name: 'id-card.jpg',
        mimeType: 'image/jpeg',
        data: readFace(FACES.personA1),
        metadata: { kind, profile_id: profile },
      });
      const error = await expectError(enrollFace(asOrgAdmin(user.id, orgA.id), profile, [id]));
      expect(error.code).toBe('file_not_found');
    }
    expect(await identityCount(orgA.id)).toBe('0');
  });
});

describe('enrollment duplicate threshold', () => {
  it(
    'should use enrollment_duplicate_threshold, not recognition_threshold, for the duplicate check',
    async () => {
      const { orgA, user } = await createTwoOrgs();
      const a = asOrgAdmin(user.id, orgA.id);
      const [p, q, r] = [await newProfile(user.id, orgA.id), await newProfile(user.id, orgA.id), await newProfile(user.id, orgA.id)];
      await enrollFace(a, p, [await uploadFace(orgA.id, FACES.personA1)]);

      // A strict recognition threshold does not weaken the enrollment duplicate check (default 0.5).
      await a.request(`mutation { update_organization_settings(where: {}, _set: { recognition_threshold: 0.01 }) { affected_rows } }`);
      const duplicate = await expectError(enrollFace(a, q, [await uploadFace(orgA.id, FACES.personA2)]));
      expect(duplicate.code).toBe('duplicate_identity');

      // A strict enrollment threshold lets the second photo through as a new identity.
      await a.request(
        `mutation { update_organization_settings(where: {}, _set: { recognition_threshold: 0.5, enrollment_duplicate_threshold: 0.01 }) { affected_rows } }`,
      );
      const created = await enrollFace(a, r, [await uploadFace(orgA.id, FACES.personA2)]);
      expect(created.photos_added).toBe(1);
      expect(await identityCount(orgA.id)).toBe('2');
    },
    SLOW,
  );
});
