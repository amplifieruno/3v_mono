import { beforeAll, describe, expect, it } from 'vitest';
import { asAdmin, asOrgAdmin } from './support/clients.js';
import { requireBackend } from './support/backend.js';
import { createIdentityFromPhotos, FACES, uploadFace } from './support/enrollment.js';
import { addMember, createTestUser, createTwoOrgs, expectError } from './support/fixtures.js';
import { atSimilarity, identityAt, results, searchFaces, templateOf, uploadSearchImage } from './support/search.js';
import { runSql } from './support/sql.js';

/**
 * Face search (slice 7, task 3): ranking with real faces through InsightFace, thresholds and match types, the
 * largest face of a group photo, failures recorded on the request, and file checks.
 */

beforeAll(requireBackend);

/** Org A with identity X (person A, photo 1) and Y (person B), both enrolled through InsightFace. */
async function enrolledWorld() {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  const x = await createIdentityFromPhotos(a, [await uploadFace(orgA.id, FACES.personA1)]);
  const y = await createIdentityFromPhotos(a, [await uploadFace(orgA.id, FACES.personB)]);
  return { orgA, orgB, user, other, a, x: x.identity_id, y: y.identity_id };
}

describe('search_faces (facial)', () => {
  it('should rank the same person first for another photo of them and store the results for the caller', async () => {
    const { orgA, user, a, x, y } = await enrolledWorld();
    const image = await uploadSearchImage(user.id, orgA.id, FACES.personA2);

    const out = await searchFaces(a, { search_type: 'facial', image_file_id: image, threshold: 0.3 });
    expect(out).toMatchObject({ status: 'completed', face_count: 1, error: null });
    expect(out.duration_ms).toBeGreaterThanOrEqual(0);

    const rows = await results(out.search_request_id);
    expect(rows[0].identity_id).toBe(x);
    expect(rows.map((r) => r.identity_id)).not.toContain(y);
    expect(out.results_count).toBe(rows.length);
    expect(out.top_confidence).toBeCloseTo(rows[0].confidence ?? 0, 5);

    const { search_requests_by_pk: request } = await asAdmin().request<{
      search_requests_by_pk: Record<string, unknown>;
    }>(
      `query ($id: uuid!) {
        search_requests_by_pk(id: $id) {
          organization_id user_id search_type image_file_id status threshold max_results fuzzy results_count face_count
          started_at completed_at
        }
      }`,
      { id: out.search_request_id },
    );
    expect(request).toMatchObject({
      organization_id: orgA.id, user_id: user.id, search_type: 'facial', image_file_id: image, status: 'completed',
      max_results: 20, fuzzy: false, face_count: 1,
    });
    expect(request.threshold).toBeCloseTo(0.3, 5);
    expect(request.completed_at).not.toBeNull();
  });

  it('should classify exact / partial / fuzzy around the threshold and rank by similarity', async () => {
    const { orgA, user, a, x } = await enrolledWorld();
    const probe = await templateOf(x);
    const exact = await identityAt(orgA.id, atSimilarity(probe, 0.72));
    const partial = await identityAt(orgA.id, atSimilarity(probe, 0.58));
    const fuzzy = await identityAt(orgA.id, atSimilarity(probe, 0.45));
    const below = await identityAt(orgA.id, atSimilarity(probe, 0.3));
    const image = await uploadSearchImage(user.id, orgA.id, FACES.personA1);

    const plain = await results((await searchFaces(a, { search_type: 'facial', image_file_id: image, threshold: 0.5 })).search_request_id);
    expect(plain.map((r) => [r.identity_id, r.match_type])).toEqual([
      [x, 'exact'],
      [exact, 'exact'],
      [partial, 'partial'],
    ]);
    expect(plain.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(plain[1].confidence).toBeCloseTo(0.72, 2);

    const withFuzzy = await results(
      (await searchFaces(a, { search_type: 'facial', image_file_id: image, threshold: 0.5, fuzzy: true })).search_request_id,
    );
    expect(withFuzzy.map((r) => [r.identity_id, r.match_type])).toEqual([
      [x, 'exact'],
      [exact, 'exact'],
      [partial, 'partial'],
      [fuzzy, 'fuzzy'],
    ]);
    expect(withFuzzy.map((r) => r.identity_id)).not.toContain(below);

    const top2 = await searchFaces(a, { search_type: 'facial', image_file_id: image, threshold: 0.5, max_results: 2 });
    expect(top2.results_count).toBe(2);
  });

  it('should never go below a similarity of 0.2, even for a fuzzy search at the lowest threshold', async () => {
    const { orgA, user, a, x } = await enrolledWorld();
    const probe = await templateOf(x);
    const low = await identityAt(orgA.id, atSimilarity(probe, 0.15, 17));
    const near = await identityAt(orgA.id, atSimilarity(probe, 0.25, 19));
    const image = await uploadSearchImage(user.id, orgA.id, FACES.personA1);
    const out = await searchFaces(a, { search_type: 'facial', image_file_id: image, threshold: 0.2, fuzzy: true });
    const ids = (await results(out.search_request_id)).map((r) => r.identity_id);
    expect(ids).toContain(near);
    expect(ids).not.toContain(low);
  });

  it('should record invalid_image for a file whose upload never completed', async () => {
    const { orgA, user, a } = await enrolledWorld();
    const image = await uploadSearchImage(user.id, orgA.id, FACES.personA1);
    await runSql(`UPDATE storage.files SET is_uploaded = false WHERE id = '${image}'`);
    const out = await searchFaces(a, { search_type: 'facial', image_file_id: image });
    expect(out).toMatchObject({ status: 'failed', error: 'invalid_image' });
  });

  it('should refuse a search image as another entity file (profile avatar)', async () => {
    const { orgA, user, a } = await enrolledWorld();
    const image = await uploadSearchImage(user.id, orgA.id, FACES.personA1);
    const error = await expectError(
      a.request(`mutation ($f: uuid!) { insert_profiles_one(object: { first_name: "A", last_name: "B", avatar_file_id: $f }) { id } }`, {
        f: image,
      }),
    );
    expect(`${error.message} ${error.detail ?? ''}`).toMatch(/file_owner_only/);
  });

  it('should exclude merged identities and identities whose biometric consent was withdrawn', async () => {
    const { orgA, user, a, x } = await enrolledWorld();
    const probe = await templateOf(x);
    const withdrawn = await identityAt(orgA.id, atSimilarity(probe, 0.9));
    const merged = await identityAt(orgA.id, atSimilarity(probe, 0.9, 11));
    const archived = await identityAt(orgA.id, atSimilarity(probe, 0.9, 13), { status: 'archived' });
    await runSql(`UPDATE itap.identities SET matching_enabled = false WHERE id = '${withdrawn}'`);
    await runSql(
      `SELECT set_config('itap.merge_context', 'on', true); UPDATE itap.identities SET status = 'merged' WHERE id = '${merged}'`,
    );
    const image = await uploadSearchImage(user.id, orgA.id, FACES.personA1);

    const ids = (await results((await searchFaces(a, { search_type: 'facial', image_file_id: image })).search_request_id)).map(
      (r) => r.identity_id,
    );
    expect(ids).toContain(x);
    expect(ids).toContain(archived);
    expect(ids).not.toContain(withdrawn);
    expect(ids).not.toContain(merged);
  });

  it('should search with the largest face of a group photo and report the face count', async () => {
    const { orgA, user, a } = await enrolledWorld();
    const image = await uploadSearchImage(user.id, orgA.id, FACES.group);
    const out = await searchFaces(a, { search_type: 'facial', image_file_id: image });
    expect(out.status).toBe('completed');
    expect(out.face_count).toBeGreaterThan(1);
  });

  it('should record a failed request for an image without a face', async () => {
    const { orgA, user, a } = await enrolledWorld();
    const image = await uploadSearchImage(user.id, orgA.id, FACES.noFace);
    const out = await searchFaces(a, { search_type: 'facial', image_file_id: image });
    expect(out).toMatchObject({ status: 'failed', error: 'no_face', results_count: 0, face_count: 0 });
  });

  it('should apply attribute filters to a combined search', async () => {
    const { orgA, user, a, x } = await enrolledWorld();
    const probe = await templateOf(x);
    const female = await identityAt(orgA.id, atSimilarity(probe, 0.8), { attributes: { gender: 'female', age: 30 } });
    const male = await identityAt(orgA.id, atSimilarity(probe, 0.8, 11), { attributes: { gender: 'male', age: 30 } });
    const image = await uploadSearchImage(user.id, orgA.id, FACES.personA1);
    const out = await searchFaces(a, { search_type: 'combined', image_file_id: image, filters: { gender: 'female' } });
    const ids = (await results(out.search_request_id)).map((r) => r.identity_id);
    expect(ids).toContain(female);
    expect(ids).not.toContain(male);
  });
});

describe('search_faces (input and file checks)', () => {
  it('should reject limits outside the documented ranges and inconsistent image arguments', async () => {
    const { orgA, user, a } = await enrolledWorld();
    const image = await uploadSearchImage(user.id, orgA.id, FACES.personA1);
    for (const args of [
      { search_type: 'facial', image_file_id: image, threshold: 0.1 },
      { search_type: 'facial', image_file_id: image, threshold: 0.99 },
      { search_type: 'facial', image_file_id: image, max_results: 101 },
      { search_type: 'facial' },
      { search_type: 'attribute', image_file_id: image },
      { search_type: 'unknown' },
    ]) {
      expect((await expectError(searchFaces(a, args))).code).toBe('invalid_input');
    }
    expect((await expectError(searchFaces(a, { search_type: 'attribute', filters: { gender: 'x' } }))).code).toBe(
      'invalid_filters',
    );
  });

  it("should not search with another member's search image, another org's file or a sensitive file", async () => {
    const { orgA, orgB, user, other, a } = await enrolledWorld();
    const colleague = await createTestUser();
    await addMember(orgA.id, colleague.id);
    const mine = await uploadSearchImage(user.id, orgA.id, FACES.personA1);
    const foreign = await uploadSearchImage(other.id, orgB.id, FACES.personA1);
    const sensitive = await (async () => {
      const id = await uploadFace(orgA.id, FACES.personA1);
      await runSql(`UPDATE storage.files SET metadata = '{"kind":"profile_document"}' WHERE id = '${id}'`);
      return id;
    })();
    const c = asOrgAdmin(colleague.id, orgA.id);
    for (const [client, file] of [[c, mine], [a, foreign], [a, sensitive]] as const) {
      expect((await expectError(searchFaces(client, { search_type: 'facial', image_file_id: file }))).code).toBe(
        'file_not_found',
      );
    }
  });

  it("should accept an organization photo of another kind (e.g. an enrollment upload)", async () => {
    const { orgA, a } = await enrolledWorld();
    const file = await uploadFace(orgA.id, FACES.personA2);
    expect((await searchFaces(a, { search_type: 'facial', image_file_id: file })).status).toBe('completed');
  });

  it('should never return identities of another organization', async () => {
    const { orgB, other, x } = await enrolledWorld();
    const image = await uploadSearchImage(other.id, orgB.id, FACES.personA1);
    const out = await searchFaces(asOrgAdmin(other.id, orgB.id), { search_type: 'facial', image_file_id: image, threshold: 0.2 });
    expect(out.status).toBe('completed');
    expect((await results(out.search_request_id)).map((r) => r.identity_id)).not.toContain(x);
    expect(out.results_count).toBe(0);
  });
});
