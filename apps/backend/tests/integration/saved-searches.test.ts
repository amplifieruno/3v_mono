import { beforeAll, describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { requireBackend } from './support/backend.js';
import { FACES } from './support/enrollment.js';
import { expectDenied, expectError } from './support/fixtures.js';
import { createSavedSearch, INSERT_SAVED_SEARCH as INSERT, savedSearchWorld, uploadSearchImage } from './support/search.js';
import { runSql } from './support/sql.js';

/**
 * Saved searches (slice 7, task 3): owner-managed, shared ones readable (not editable) by the organization; run
 * errors visible to the owner only. The cron is covered by saved-searches-cron.test.ts.
 */

beforeAll(requireBackend);

const LIST = `query { saved_searches(order_by: { name: asc }) { id name is_shared } }`;
const RENAME = `
  mutation ($id: uuid!) { update_saved_searches_by_pk(pk_columns: { id: $id }, _set: { name: "Renamed" }) { id } }
`;
const REMOVE = `mutation ($id: uuid!) { delete_saved_searches_by_pk(id: $id) { id } }`;

const T0 = '2030-03-04T10:00:00.000Z';

const create = createSavedSearch;
const world = savedSearchWorld;

describe('saved_searches permissions', () => {
  it('should stamp the owner from the session and let the owner edit and delete', async () => {
    const { user, a } = await world();
    const { insert_saved_searches_one: row } = await a.request<{ insert_saved_searches_one: { id: string; owner_id: string } }>(
      INSERT,
      { o: { name: 'Mine', search_type: 'attribute', filters: { gender: 'female' } } },
    );
    expect(row.owner_id).toBe(user.id);
    expect((await a.request<{ update_saved_searches_by_pk: unknown }>(RENAME, { id: row.id })).update_saved_searches_by_pk).not.toBeNull();
    expect((await a.request<{ delete_saved_searches_by_pk: unknown }>(REMOVE, { id: row.id })).delete_saved_searches_by_pk).not.toBeNull();
  });

  it('should show shared saved searches to other members read-only and hide private ones', async () => {
    const { orgB, other, a, c } = await world();
    const shared = await create(a, { name: 'Shared', is_shared: true });
    await create(a, { name: 'Private' });
    expect((await c.request<{ saved_searches: { name: string }[] }>(LIST)).saved_searches.map((s) => s.name)).toEqual(['Shared']);
    expect((await c.request<{ update_saved_searches_by_pk: unknown }>(RENAME, { id: shared })).update_saved_searches_by_pk).toBeNull();
    expect((await c.request<{ delete_saved_searches_by_pk: unknown }>(REMOVE, { id: shared })).delete_saved_searches_by_pk).toBeNull();
    expect((await asOrgAdmin(other.id, orgB.id).request<{ saved_searches: unknown[] }>(LIST)).saved_searches).toEqual([]);
  });

  it('should keep run state and the owner read-only', async () => {
    const { colleague, a } = await world();
    await expectDenied(create(a, { name: 'X', owner_id: colleague.id }), 'owner_id');
    await expectDenied(create(a, { name: 'X', last_run_at: T0 }), 'last_run_at');
    await expectDenied(create(a, { name: 'X', next_run_at: T0 }), 'next_run_at');
  });

  it("should show a run error to the owner only", async () => {
    const { a, c } = await world();
    const id = await create(a, { name: 'Shared', is_shared: true });
    await runSql(`UPDATE itap.saved_searches SET last_error = 'no_face', last_run_status = 'failed' WHERE id = '${id}'`);
    const ERR = `query ($id: uuid!) { saved_searches_by_pk(id: $id) { last_run_status owner_last_error } }`;
    expect((await a.request<{ saved_searches_by_pk: unknown }>(ERR, { id })).saved_searches_by_pk).toEqual({
      last_run_status: 'failed', owner_last_error: 'no_face',
    });
    expect((await c.request<{ saved_searches_by_pk: unknown }>(ERR, { id })).saved_searches_by_pk).toEqual({
      last_run_status: 'failed', owner_last_error: null,
    });
    await expectDenied(c.request(`query ($id: uuid!) { saved_searches_by_pk(id: $id) { last_error } }`, { id }), 'last_error');
  });

  it('should validate cron, filters, image and limits', async () => {
    const { orgA, colleague, a } = await world();
    for (const object of [
      { name: 'bad cron', schedule_cron: '61 * * * *' },
      { name: 'bad filters', filters: { gender: 'x' } },
      { name: 'facial without image', search_type: 'facial' },
      { name: 'threshold', threshold: 0.1 },
      { name: 'max', max_results: 500 },
      { name: '  ' },
    ]) {
      await expectError(create(a, object));
    }
    // Another member's search image cannot back my saved search.
    const theirs = await uploadSearchImage(colleague.id, orgA.id, FACES.personA1);
    await expectError(create(a, { name: 'theirs', search_type: 'facial', image_file_id: theirs }));
  });
});
