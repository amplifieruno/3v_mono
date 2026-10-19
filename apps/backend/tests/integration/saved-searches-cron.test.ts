import { beforeAll, describe, expect, it } from 'vitest';
import { requireBackend } from './support/backend.js';
import { createIdentityFromPhotos, FACES, uploadFace } from './support/enrollment.js';
import { createIdentityAsAdmin } from './support/faces.js';
import {
  createSavedSearch,
  matchEvents,
  results,
  runSavedSearchCron,
  savedSearchState,
  savedSearchWorld,
  uploadSearchImage,
} from './support/search.js';
import { runSql, runSqlRows } from './support/sql.js';

/**
 * Cron run_saved_searches (slice 7, task 3): scheduled saved searches run as their owner; the first run (and the
 * first run after a definition change) sets the baseline without alerts; later runs alert identities new since the
 * previous run; inactive or disabled owners are skipped.
 */

beforeAll(requireBackend);

const T0 = '2030-03-04T10:00:00.000Z';
const hours = (h: number): string => new Date(Date.parse(T0) + h * 3600_000).toISOString();
const pg = (iso: string): string => iso.replace('.000Z', '+00:00');

async function femaleIdentity(orgId: string): Promise<string> {
  return (await createIdentityAsAdmin(orgId, { attributes: { gender: 'female' } })).id;
}

async function scheduled(object: Record<string, unknown> = {}) {
  const w = await savedSearchWorld();
  const first = await femaleIdentity(w.orgA.id);
  const id = await createSavedSearch(w.a, {
    name: 'Women', filters: { gender: 'female' }, schedule_cron: '0 * * * *', alert_on_match: true, ...object,
  });
  // First cron run: computes next_run_at only.
  await runSavedSearchCron([w.orgA.id], hours(0));
  expect((await savedSearchState(id)).next_run_at).toBe(pg(hours(1)));
  return { ...w, id, first };
}

async function requestCount(savedSearchId: string): Promise<string | null> {
  const [row] = await runSqlRows(`SELECT count(*) AS n FROM itap.search_requests WHERE saved_search_id = '${savedSearchId}'`);
  return row.n;
}

describe('run_saved_searches cron', () => {
  it('should run a due saved search as its owner and set the baseline without alerts on the first run', async () => {
    const { orgA, user, id, first } = await scheduled();
    expect(await runSavedSearchCron([orgA.id], hours(1))).toMatchObject({ ran: 1 });
    const state = await savedSearchState(id);
    expect(state).toMatchObject({ last_run_status: 'completed', last_error: null, next_run_at: pg(hours(2)) });
    const [request] = await runSqlRows(
      `SELECT user_id::text, saved_search_id::text, status FROM itap.search_requests WHERE id = '${state.last_search_request_id}'`,
    );
    expect(request).toEqual({ user_id: user.id, saved_search_id: id, status: 'completed' });
    expect((await results(state.last_search_request_id ?? '')).map((r) => r.identity_id)).toEqual([first]);
    expect(await matchEvents(orgA.id)).toEqual([]);
  });

  it('should alert only identities that are new since the previous run, at the scheduled time of the cron', async () => {
    const { orgA, id } = await scheduled();
    await runSavedSearchCron([orgA.id], hours(1));
    const second = await femaleIdentity(orgA.id);
    // A late cron delivery: next_run_at was hours(2), the cron's scheduled time is 30 minutes later.
    const late = hours(2.5);
    await runSavedSearchCron([orgA.id], late);
    expect(await matchEvents(orgA.id)).toEqual([
      { identity_id: second, dedup_key: `saved_search:${id}:${second}:2030-03-04`, occurred_at: pg(late) },
    ]);
    expect((await savedSearchState(id)).last_run_at).toBe(pg(late));
    // Nothing new: no event.
    await runSavedSearchCron([orgA.id], hours(3));
    expect(await matchEvents(orgA.id)).toHaveLength(1);
  });

  it('should reset the baseline when the definition changes, so the next run alerts nothing', async () => {
    const { orgA, a, id } = await scheduled();
    await runSavedSearchCron([orgA.id], hours(1));
    expect((await savedSearchState(id)).last_search_request_id).not.toBeNull();
    const male = (await createIdentityAsAdmin(orgA.id, { attributes: { gender: 'male' } })).id;
    await a.request(`mutation ($id: uuid!) { update_saved_searches_by_pk(pk_columns: { id: $id }, _set: { filters: {} }) { id } }`, { id });
    expect((await savedSearchState(id)).last_search_request_id).toBeNull();
    await runSavedSearchCron([orgA.id], hours(2));
    expect((await savedSearchState(id)).last_run_status).toBe('completed');
    expect((await matchEvents(orgA.id)).map((e) => e.identity_id)).not.toContain(male);
    expect(await matchEvents(orgA.id)).toEqual([]);
  });

  it('should keep the baseline when only the name or sharing changes', async () => {
    const { orgA, a, id } = await scheduled();
    await runSavedSearchCron([orgA.id], hours(1));
    const before = (await savedSearchState(id)).last_search_request_id;
    await a.request(`mutation ($id: uuid!) { update_saved_searches_by_pk(pk_columns: { id: $id }, _set: { name: "W", is_shared: true }) { id } }`, { id });
    expect((await savedSearchState(id)).last_search_request_id).toBe(before);
  });

  it('should not run again for the same scheduled time (retried cron)', async () => {
    const { orgA, id } = await scheduled();
    await runSavedSearchCron([orgA.id], hours(1));
    await runSavedSearchCron([orgA.id], hours(1));
    expect(await requestCount(id)).toBe('1');
  });

  it('should run without events when alert_on_match is off', async () => {
    const { orgA, id } = await scheduled({ alert_on_match: false });
    await runSavedSearchCron([orgA.id], hours(1));
    await femaleIdentity(orgA.id);
    await runSavedSearchCron([orgA.id], hours(2));
    expect((await savedSearchState(id)).last_run_status).toBe('completed');
    expect(await matchEvents(orgA.id)).toEqual([]);
  });

  it('should skip and record when the owner is no longer an active member', async () => {
    const { orgA, user, id } = await scheduled();
    await runSql(
      `UPDATE itap.organization_members SET status = 'deactivated', deactivated_at = now() WHERE organization_id = '${orgA.id}' AND user_id = '${user.id}'`,
    );
    expect(await runSavedSearchCron([orgA.id], hours(1))).toMatchObject({ skipped: 1, ran: 0 });
    expect(await savedSearchState(id)).toMatchObject({
      last_run_status: 'skipped', last_error: 'owner_inactive', last_search_request_id: null, next_run_at: pg(hours(2)),
    });
    expect(await requestCount(id)).toBe('0');
  });

  it('should skip when the owner account is disabled', async () => {
    const { orgA, user, id } = await scheduled();
    await runSql(`UPDATE auth.users SET disabled = true WHERE id = '${user.id}'`);
    expect(await runSavedSearchCron([orgA.id], hours(1))).toMatchObject({ skipped: 1, ran: 0 });
    expect(await savedSearchState(id)).toMatchObject({ last_run_status: 'skipped', last_error: 'owner_inactive' });
    expect(await requestCount(id)).toBe('0');
  });

  it('should run a facial saved search with the owner image through InsightFace', async () => {
    const w = await savedSearchWorld();
    const enrolled = await createIdentityFromPhotos(w.a, [await uploadFace(w.orgA.id, FACES.personA1)]);
    const image = await uploadSearchImage(w.user.id, w.orgA.id, FACES.personA2);
    const id = await createSavedSearch(w.a, {
      name: 'Person A', search_type: 'facial', image_file_id: image, threshold: 0.3, schedule_cron: '0 * * * *',
      alert_on_match: true,
    });
    await runSavedSearchCron([w.orgA.id], hours(0));
    await runSavedSearchCron([w.orgA.id], hours(1));
    const state = await savedSearchState(id);
    expect(state.last_run_status).toBe('completed');
    expect((await results(state.last_search_request_id ?? ''))[0].identity_id).toBe(enrolled.identity_id);
  });
});
