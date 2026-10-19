import { beforeAll, describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { requireBackend } from './support/backend.js';
import { createIdentityFromPhotos, FACES, uploadFace } from './support/enrollment.js';
import { addMember, createTestUser, createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';
import { searchFaces, uploadSearchImage } from './support/search.js';
import { runSqlRows } from './support/sql.js';

/**
 * Review Focus 5 (slice 7): search history, results and search images are owner-only; other members of the
 * organization (and other organizations) see none of them.
 */

beforeAll(requireBackend);

const HISTORY = `
  query ($id: uuid!) {
    search_requests { id }
    search_requests_by_pk(id: $id) { id }
    search_results(where: { search_request_id: { _eq: $id } }) { id identity_id }
  }
`;
const FILES = `query ($id: uuid!) { file(id: $id) { id } }`;
const OPEN = `mutation ($id: uuid!) { open_file(file_id: $id) { url } }`;
const DELETE = `mutation ($id: uuid!) { delete_file(file_id: $id) { file_id } }`;
const AUDIT = `query ($id: uuid!) { audit_log(where: { entity: { _eq: "search_requests" }, entity_id: { _eq: $id } }) { action } }`;

type History = { search_requests: { id: string }[]; search_requests_by_pk: { id: string } | null; search_results: unknown[] };

async function world() {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  const colleague = await createTestUser();
  await addMember(orgA.id, colleague.id);
  const a = asOrgAdmin(user.id, orgA.id);
  await createIdentityFromPhotos(a, [await uploadFace(orgA.id, FACES.personA1)]);
  const image = await uploadSearchImage(user.id, orgA.id, FACES.personA2);
  const out = await searchFaces(a, { search_type: 'facial', image_file_id: image, threshold: 0.3 });
  expect(out.results_count).toBeGreaterThan(0);
  return { orgA, orgB, user, other, colleague, a, image, requestId: out.search_request_id };
}

describe('search history visibility', () => {
  it('should show my requests, results and search image to me', async () => {
    const { a, image, requestId } = await world();
    const mine = await a.request<History>(HISTORY, { id: requestId });
    expect(mine.search_requests.map((r) => r.id)).toEqual([requestId]);
    expect(mine.search_requests_by_pk?.id).toBe(requestId);
    expect(mine.search_results.length).toBeGreaterThan(0);
    expect((await a.request<{ file: { id: string } | null }>(FILES, { id: image })).file?.id).toBe(image);
    expect((await a.request<{ audit_log: unknown[] }>(AUDIT, { id: requestId })).audit_log).toHaveLength(1);
  });

  it("should hide another member's requests, results, audit rows and search image", async () => {
    const { orgA, colleague, image, requestId } = await world();
    const c = asOrgAdmin(colleague.id, orgA.id);
    expect(await c.request<History>(HISTORY, { id: requestId })).toEqual({
      search_requests: [],
      search_requests_by_pk: null,
      search_results: [],
    });
    expect((await c.request<{ file: unknown }>(FILES, { id: image })).file).toBeNull();
    expect((await c.request<{ audit_log: unknown[] }>(AUDIT, { id: requestId })).audit_log).toEqual([]);
    expect((await expectError(c.request(OPEN, { id: image }))).code).toBe('file_not_found');
    expect((await expectError(c.request(DELETE, { id: image }))).code).toBe('file_not_found');
  });

  it('should hide everything from another organization', async () => {
    const { orgB, other, image, requestId } = await world();
    const b = asOrgAdmin(other.id, orgB.id);
    expect(await b.request<History>(HISTORY, { id: requestId })).toEqual({
      search_requests: [],
      search_requests_by_pk: null,
      search_results: [],
    });
    expect((await b.request<{ file: unknown }>(FILES, { id: image })).file).toBeNull();
  });

  it('should not let anyone write search history directly', async () => {
    const { orgA, user, a, requestId } = await world();
    await expectDenied(
      a.request(`mutation { insert_search_requests_one(object: { search_type: attribute, user_id: "${user.id}" }) { id } }`),
      'insert_search_requests_one',
    );
    await expectDenied(
      a.request(`mutation ($id: uuid!) { update_search_requests_by_pk(pk_columns: { id: $id }, _set: { status: failed }) { id } }`, {
        id: requestId,
      }),
      'update_search_requests_by_pk',
    );
    await expectDenied(
      a.request(`mutation ($id: uuid!) { delete_search_requests_by_pk(id: $id) { id } }`, { id: requestId }),
      'delete_search_requests_by_pk',
    );
    await expectDenied(
      a.request(`mutation { insert_search_results(objects: []) { affected_rows } }`),
      'insert_search_results',
    );
    const [row] = await runSqlRows(`SELECT count(*) AS n FROM itap.search_requests WHERE organization_id = '${orgA.id}'`);
    expect(row.n).toBe('1');
  });

  it('should keep the owner able to open and delete their own search image', async () => {
    const { a, image } = await world();
    expect((await a.request<{ open_file: { url: string } }>(OPEN, { id: image })).open_file.url).toMatch(/^http/);
    expect((await a.request<{ delete_file: { file_id: string } }>(DELETE, { id: image })).delete_file.file_id).toBe(image);
  });

  it("should not let another member enroll a face from someone's search image", async () => {
    const { orgA, colleague, image } = await world();
    const c = asOrgAdmin(colleague.id, orgA.id);
    expect((await expectError(createIdentityFromPhotos(c, [image]))).code).toBe('file_not_found');
  });
});
