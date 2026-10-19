import { beforeAll, describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { requireBackend } from './support/backend.js';
import {
  addIdentityPhotos,
  createIdentityFromPhotos,
  enrollFace,
  FACES,
  uploadFace,
} from './support/enrollment.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import { auditRows, newProfile, PROFILE_COUNT } from './support/lifecycle.js';
import { runSqlRows } from './support/sql.js';

// Every call runs InsightFace on CPU for each photo.
const SLOW = 90_000;

beforeAll(requireBackend);

async function orgIdentities(orgId: string) {
  return runSqlRows(
    // run_sql renders SQL NULL as the string 'NULL': map nullable columns explicitly.
    `select id, code, coalesce(profile_id::text, 'none') as profile_id, is_primary_for_profile::text as primary, source,
            coalesce(link_strength::text, 'none') as strength,
            (primary_photo_file_id is not null)::text as has_primary_photo, attributes::text as attributes
       from itap.identities where organization_id = '${orgId}' order by number`,
  );
}

async function photosOf(identityId: string) {
  return runSqlRows(
    `select p.kind, p.quality_score::text as quality, f.bucket_id, f.metadata ->> 'kind' as file_kind,
            coalesce(f.metadata ->> 'source_file_id', 'none') as source_file_id, f.mime_type
       from itap.identity_photos p join storage.files f on f.id = p.file_id
      where p.identity_id = '${identityId}' order by p.created_at`,
  );
}

async function embeddingsOf(identityId: string) {
  return runSqlRows(
    `select is_template::text as template, coalesce(model_version, 'none') as model_version,
            (photo_file_id is not null)::text as has_photo, quality_score::text as quality
       from itap.identity_embeddings where identity_id = '${identityId}'`,
  );
}

describe('enroll_face', () => {
  it(
    'should create one identity linked to the profile from two photos of the same person',
    async () => {
      const { orgA, user } = await createTwoOrgs();
      const a = asOrgAdmin(user.id, orgA.id);
      const profile = await newProfile(user.id, orgA.id);
      const files = [await uploadFace(orgA.id, FACES.personA1), await uploadFace(orgA.id, FACES.personA2)];

      const result = await enrollFace(a, profile, files);
      expect(result.identity_code).toMatch(/^IDENTITY-\d{5}$/);
      expect(result).toMatchObject({ photos_added: 2, rejected: [] });
      expect(result.templates).toBeGreaterThanOrEqual(1);

      const identities = await orgIdentities(orgA.id);
      expect(identities).toHaveLength(1);
      expect(identities[0]).toMatchObject({
        id: result.identity_id,
        code: result.identity_code,
        profile_id: profile,
        primary: 'true',
        source: 'enrollment',
        strength: '1',
      });
      expect(identities[0].has_primary_photo).toBe('true');

      const photos = await photosOf(result.identity_id);
      expect(photos).toHaveLength(2);
      for (const photo of photos) {
        expect(photo).toMatchObject({ kind: 'enrollment', bucket_id: orgA.id, file_kind: 'identity_photo', mime_type: 'image/jpeg' });
        expect(Number(photo.quality)).toBeGreaterThan(0);
      }
      expect(photos.map((p) => p.source_file_id).sort()).toEqual([...files].sort());

      const embeddings = await embeddingsOf(result.identity_id);
      expect(embeddings).toHaveLength(2);
      expect(embeddings.filter((e) => e.template === 'true')).toHaveLength(result.templates);
      expect(embeddings.every((e) => e.model_version === 'insightface:w600k_mbf' && e.has_photo === 'true')).toBe(true);

      // Written through `actor`: the audit trail records the caller.
      expect(await auditRows(result.identity_id)).toContainEqual({ action: 'insert', user_id: user.id, reason: null });

      const counts = await a.request<{ profiles_by_pk: { identities_count: number; has_face: boolean } }>(PROFILE_COUNT, {
        id: profile,
      });
      expect(counts.profiles_by_pk).toEqual({ identities_count: 1, has_face: true });
    },
    SLOW,
  );

  it(
    'should add to the existing identity when the same face is enrolled again for the same profile',
    async () => {
      const { orgA, user } = await createTwoOrgs();
      const a = asOrgAdmin(user.id, orgA.id);
      const profile = await newProfile(user.id, orgA.id);
      const files = [await uploadFace(orgA.id, FACES.personA1), await uploadFace(orgA.id, FACES.personA2)];

      const first = await enrollFace(a, profile, files);
      const second = await enrollFace(a, profile, files);
      expect(second.identity_id).toBe(first.identity_id);
      expect(second.photos_added).toBe(2);
      expect(await orgIdentities(orgA.id)).toHaveLength(1);
      expect(await photosOf(first.identity_id)).toHaveLength(4);
    },
    SLOW,
  );

  it(
    'should refuse a face already enrolled for another profile with duplicate_identity and the matched code',
    async () => {
      const { orgA, user } = await createTwoOrgs();
      const a = asOrgAdmin(user.id, orgA.id);
      const [p, q] = [await newProfile(user.id, orgA.id), await newProfile(user.id, orgA.id)];
      const file = await uploadFace(orgA.id, FACES.personA1);
      const enrolled = await enrollFace(a, p, [file]);

      const other = await uploadFace(orgA.id, FACES.personA2);
      const error = await expectError(enrollFace(a, q, [other]));
      expect(error.code).toBe('duplicate_identity');
      expect(error.message).toBe(enrolled.identity_code);
      expect(await orgIdentities(orgA.id)).toHaveLength(1);
      expect(await photosOf(enrolled.identity_id)).toHaveLength(1);
    },
    SLOW,
  );

  it(
    'should reject photos without exactly one usable face and keep the others',
    async () => {
      const { orgA, user } = await createTwoOrgs();
      const a = asOrgAdmin(user.id, orgA.id);
      const profile = await newProfile(user.id, orgA.id);
      const good = await uploadFace(orgA.id, FACES.personB);
      const noFace = await uploadFace(orgA.id, FACES.noFace);
      const group = await uploadFace(orgA.id, FACES.group);

      const result = await enrollFace(a, profile, [noFace, good, group]);
      expect(result.photos_added).toBe(1);
      expect(result.rejected).toEqual([
        { file_id: noFace, reason: 'no_face' },
        { file_id: group, reason: 'multiple_faces' },
      ]);
    },
    SLOW,
  );

  it(
    'should fail with no_valid_photos when a new identity would have no usable face',
    async () => {
      const { orgA, user } = await createTwoOrgs();
      const profile = await newProfile(user.id, orgA.id);
      const noFace = await uploadFace(orgA.id, FACES.noFace);
      const error = await expectError(enrollFace(asOrgAdmin(user.id, orgA.id), profile, [noFace]));
      expect(error.code).toBe('no_valid_photos');
      expect(await orgIdentities(orgA.id)).toEqual([]);
    },
    SLOW,
  );

  it('should answer file_not_found for a file in another organization bucket', async () => {
    const { orgA, orgB, user } = await createTwoOrgs();
    const profile = await newProfile(user.id, orgA.id);
    const foreign = await uploadFace(orgB.id, FACES.personA1);
    const error = await expectError(enrollFace(asOrgAdmin(user.id, orgA.id), profile, [foreign]));
    expect(error.code).toBe('file_not_found');
    expect(await orgIdentities(orgA.id)).toEqual([]);
  });

  it('should answer profile_not_found for a profile in another organization', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const foreignProfile = await newProfile(other.id, orgB.id);
    const file = await uploadFace(orgA.id, FACES.personA1);
    const error = await expectError(enrollFace(asOrgAdmin(user.id, orgA.id), foreignProfile, [file]));
    expect(error.code).toBe('profile_not_found');
  });

  it(
    'should link a matching unlinked identity instead of creating a new one',
    async () => {
      const { orgA, user } = await createTwoOrgs();
      const a = asOrgAdmin(user.id, orgA.id);
      const unknown = await createIdentityFromPhotos(a, [await uploadFace(orgA.id, FACES.personA1)]);
      const profile = await newProfile(user.id, orgA.id);

      const result = await enrollFace(a, profile, [await uploadFace(orgA.id, FACES.personA2)]);
      expect(result.identity_id).toBe(unknown.identity_id);
      const identities = await orgIdentities(orgA.id);
      expect(identities).toHaveLength(1);
      expect(identities[0]).toMatchObject({ profile_id: profile, primary: 'true' });
    },
    SLOW,
  );
});

describe('create_identity_from_photos', () => {
  it(
    'should create a new unlinked identity with a code and refuse the same face again',
    async () => {
      const { orgA, orgB, user, other } = await createTwoOrgs();
      const a = asOrgAdmin(user.id, orgA.id);
      const result = await createIdentityFromPhotos(a, [await uploadFace(orgA.id, FACES.personB)], { note: 'lobby' });
      expect(result).toMatchObject({ photos_added: 1, templates: 1, rejected: [] });
      expect(result.identity_code).toMatch(/^IDENTITY-\d{5}$/);
      const [identity] = await orgIdentities(orgA.id);
      expect(identity).toMatchObject({
        id: result.identity_id,
        profile_id: 'none',
        primary: 'false',
        source: 'manual',
        has_primary_photo: 'true',
      });
      expect(JSON.parse(identity.attributes ?? '{}')).toEqual({ note: 'lobby' });
      expect((await photosOf(result.identity_id))[0]).toMatchObject({ kind: 'manual', file_kind: 'identity_photo' });

      const again = await expectError(createIdentityFromPhotos(a, [await uploadFace(orgA.id, FACES.personB)]));
      expect(again.code).toBe('duplicate_identity');
      expect(again.message).toBe(result.identity_code);

      // The same face in another organization is a different person record (Review Focus 5).
      const b = asOrgAdmin(other.id, orgB.id);
      const inB = await createIdentityFromPhotos(b, [await uploadFace(orgB.id, FACES.personB)]);
      expect(inB.identity_id).not.toBe(result.identity_id);
    },
    SLOW,
  );
});

describe('add_identity_photos', () => {
  it(
    'should add matching photos and reject a photo of a different known identity as conflicting_identity',
    async () => {
      const { orgA, user } = await createTwoOrgs();
      const a = asOrgAdmin(user.id, orgA.id);
      const personA = await createIdentityFromPhotos(a, [await uploadFace(orgA.id, FACES.personA1)]);
      const personB = await createIdentityFromPhotos(a, [await uploadFace(orgA.id, FACES.personB)]);

      const sameA = await uploadFace(orgA.id, FACES.personA2);
      const ofB = await uploadFace(orgA.id, FACES.personB);
      const result = await addIdentityPhotos(a, personA.identity_id, [sameA, ofB]);
      expect(result).toMatchObject({ identity_id: personA.identity_id, identity_code: personA.identity_code, photos_added: 1 });
      expect(result.rejected).toEqual([{ file_id: ofB, reason: 'conflicting_identity' }]);
      expect(result.templates).toBe(2);
      expect(await photosOf(personA.identity_id)).toHaveLength(2);
      expect(await photosOf(personB.identity_id)).toHaveLength(1);
    },
    SLOW,
  );

  it('should answer identity_not_found for an identity in another organization', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const b = asOrgAdmin(other.id, orgB.id);
    const foreign = await createIdentityFromPhotos(b, [await uploadFace(orgB.id, FACES.personB)]);
    const file = await uploadFace(orgA.id, FACES.personB);
    const error = await expectError(addIdentityPhotos(asOrgAdmin(user.id, orgA.id), foreign.identity_id, [file]));
    expect(error.code).toBe('identity_not_found');
  }, SLOW);
});
