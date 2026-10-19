import { beforeAll, describe, expect, it } from 'vitest';
import type { HasuraClient } from '../../src/hasura/client.js';
import { asOrgAdmin } from './support/clients.js';
import { requireBackend } from './support/backend.js';
import { createIdentityFromPhotos, FACES, uploadFace } from './support/enrollment.js';
import { createIdentityAsAdmin } from './support/faces.js';
import { addMember, createTestUser, createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';
import { matchEvents, results, runSavedSearchCron, savedSearchState, uploadSearchImage } from './support/search.js';
import { runSql, runSqlRows } from './support/sql.js';

/**
 * Saved searches (slice 7, task 3): owner-managed, shared ones readable (not editable) by the organization; the
 * hourly cron runs scheduled ones as their owner and alerts only on identities new since the previous run.
 */

beforeAll(requireBackend);

const INSERT = `
  mutation ($o: saved_searches_insert_input!) { insert_saved_searches_one(object: $o) { id owner_id next_run_at } }
`;
const LIST = `query { saved_searches(order_by: { name: asc }) { id name is_shared } }`;
const RENAME = `
  mutation ($id: uuid!) { update_saved_searches_by_pk(pk_columns: { id: $id }, _set: { name: "Renamed" }) { id } }
`;
const REMOVE = `mutation ($id: uuid!) { delete_saved_searches_by_pk(id: $id) { id } }`;

const T0 = '2030-03-04T10:00:00.000Z';
const hours = (h: number): string => new Date(Date.parse(T0) + h * 3600_000).toISOString();

async function create(client: HasuraClient, object: Record<string, unknown>): Promise<string> {
  const data = await client.request<{ insert_saved_searches_one: { id: string } }>(INSERT, {
    o: { search_type: 'attribute', filters: {}, ...object },
  });
  return data.insert_saved_searches_one.id;
}

async function world() {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  const colleague = await createTestUser();
  await addMember(orgA.id, colleague.id);
  return { orgA, orgB, user, other, colleague, a: asOrgAdmin(user.id, orgA.id), c: asOrgAdmin(colleague.id, orgA.id) };
}

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

describe('run_saved_searches cron', () => {
  async function scheduled(object: Record<string, unknown> = {}) {
    const w = await world();
    const first = (await createIdentityAsAdmin(w.orgA.id, { attributes: { gender: 'female' } })).id;
    const id = await create(w.a, {
      name: 'Women', filters: { gender: 'female' }, schedule_cron: '0 * * * *', alert_on_match: true, ...object,
    });
    // First cron run: computes next_run_at only.
    await runSavedSearchCron([w.orgA.id], hours(0));
    expect((await savedSearchState(id)).next_run_at).toBe(hours(1).replace('.000Z', '+00:00'));
    return { ...w, id, first };
  }

  it('should run a due saved search as its owner and alert every match on the first run', async () => {
    const { orgA, user, id, first } = await scheduled();
    const result = await runSavedSearchCron([orgA.id], hours(1));
    expect(result).toMatchObject({ ran: 1 });
    const state = await savedSearchState(id);
    expect(state).toMatchObject({ last_run_status: 'completed', last_error: null });
    expect(state.next_run_at).toBe(hours(2).replace('.000Z', '+00:00'));
    const [request] = await runSqlRows(
      `SELECT user_id::text, saved_search_id::text, status FROM itap.search_requests WHERE id = '${state.last_search_request_id}'`,
    );
    expect(request).toEqual({ user_id: user.id, saved_search_id: id, status: 'completed' });
    expect((await results(state.last_search_request_id ?? '')).map((r) => r.identity_id)).toEqual([first]);
    expect(await matchEvents(orgA.id)).toEqual([
      { identity_id: first, dedup_key: `saved_search:${id}:${first}:2030-03-04` },
    ]);
  });

  it('should alert only identities that are new since the previous run', async () => {
    const { orgA, id, first } = await scheduled();
    await runSavedSearchCron([orgA.id], hours(1));
    const second = (await createIdentityAsAdmin(orgA.id, { attributes: { gender: 'female' } })).id;
    await runSavedSearchCron([orgA.id], hours(2));
    const events = await matchEvents(orgA.id);
    expect(events.map((e) => e.identity_id).sort()).toEqual([first, second].sort());
    expect(events.filter((e) => e.identity_id === first)).toHaveLength(1);
    // A third run with no new identities emits nothing.
    await runSavedSearchCron([orgA.id], hours(3));
    expect(await matchEvents(orgA.id)).toHaveLength(2);
    expect((await savedSearchState(id)).last_run_at).toBe(hours(3).replace('.000Z', '+00:00'));
  });

  it('should not run again for the same scheduled time (retried cron)', async () => {
    const { orgA, id } = await scheduled();
    await runSavedSearchCron([orgA.id], hours(1));
    await runSavedSearchCron([orgA.id], hours(1));
    const [row] = await runSqlRows(`SELECT count(*) AS n FROM itap.search_requests WHERE saved_search_id = '${id}'`);
    expect(row.n).toBe('1');
  });

  it('should run without events when alert_on_match is off', async () => {
    const { orgA, id } = await scheduled({ alert_on_match: false });
    await runSavedSearchCron([orgA.id], hours(1));
    expect((await savedSearchState(id)).last_run_status).toBe('completed');
    expect(await matchEvents(orgA.id)).toEqual([]);
  });

  it('should skip and record when the owner is no longer an active member', async () => {
    const { orgA, user, id } = await scheduled();
    await runSql(
      `UPDATE itap.organization_members SET status = 'deactivated', deactivated_at = now() WHERE organization_id = '${orgA.id}' AND user_id = '${user.id}'`,
    );
    const result = await runSavedSearchCron([orgA.id], hours(1));
    expect(result).toMatchObject({ skipped: 1, ran: 0 });
    expect(await savedSearchState(id)).toMatchObject({
      last_run_status: 'skipped', last_error: 'owner_inactive', last_search_request_id: null,
      next_run_at: hours(2).replace('.000Z', '+00:00'),
    });
    const [row] = await runSqlRows(`SELECT count(*) AS n FROM itap.search_requests WHERE saved_search_id = '${id}'`);
    expect(row.n).toBe('0');
    expect(await matchEvents(orgA.id)).toEqual([]);
  });

  it('should run a facial saved search with the owner image through InsightFace', async () => {
    const w = await world();
    const enrolled = await createIdentityFromPhotos(w.a, [await uploadFace(w.orgA.id, FACES.personA1)]);
    const image = await uploadSearchImage(w.user.id, w.orgA.id, FACES.personA2);
    const id = await create(w.a, {
      name: 'Person A', search_type: 'facial', image_file_id: image, threshold: 0.3, schedule_cron: '0 * * * *',
      alert_on_match: true,
    });
    await runSavedSearchCron([w.orgA.id], hours(0));
    await runSavedSearchCron([w.orgA.id], hours(1));
    const state = await savedSearchState(id);
    expect(state.last_run_status).toBe('completed');
    expect((await results(state.last_search_request_id ?? ''))[0].identity_id).toBe(enrolled.identity_id);
    expect((await matchEvents(w.orgA.id)).map((e) => e.identity_id)).toContain(enrolled.identity_id);
  });
});
