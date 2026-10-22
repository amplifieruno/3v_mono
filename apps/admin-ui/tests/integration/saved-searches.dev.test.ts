import {
  type DataProvider,
  type MutationContext,
  type QueryContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEARCH_RESULTS_BINDING, searchRun } from '../../src/blocks/search-results/search-results-query';
import { createItapHasuraProvider } from '../../src/data/provider';
import { SAVED_SEARCH_RESOURCE } from '../../src/data/resource-names';
import { SAVED_SEARCH_BINDING } from '../../src/modules/search/saved-search-ops';
import {
  definitionChanged,
  runNowDefinitionOf,
  savedSearchChangesOf,
  savedSearchInsertOf,
  savedSearchValuesOf,
} from '../../src/modules/search/saved-search-shape';
import { SEARCH_BINDING, searchOutcome } from '../../src/modules/search/search-ops';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, devAdminSecret, signInDev } from '../support/dev-stack';
import { offsetPage, type TestQueryInput } from '../support/pagination';

/**
 * Saved searches of Nova against the dev stack, as `org_admin`, through the console's own
 * operations: a saved attribute search is created owned by the member, refused with a sentence
 * when a filter names an unknown company, run now with results that leave its baseline alone;
 * with a baseline set (as the `run_saved_searches` cron's completed run sets it), an edit of the
 * settings only keeps it and an edit of the search itself resets it on the server (Review Focus
 * 5); then it is deleted. Cleanup: the saved search and the test's search requests (admin secret).
 */

const IDENTITY = { providerId: 'hasura', sessionKey: 'saved-searches-dev-test', scopeKey: null, bindingRevision: '1' } as const;
const session = { sessionKey: IDENTITY.sessionKey, scopeKey: null, generation: 1 };
const ref = { namespace: 'default', id: SAVED_SEARCH_RESOURCE };

type Row = Record<string, unknown>;

const mutationContext = (): MutationContext => ({
  signal: new AbortController().signal,
  requestContext: {},
  session,
  providerServiceKey: 'hasura',
  idempotencyKey: crypto.randomUUID(),
});
const queryContext = (): QueryContext => ({ signal: new AbortController().signal, requestContext: {}, session, providerServiceKey: 'hasura' }) as QueryContext;

const adminRequest = async (path: string, body: unknown): Promise<Row> => {
  const response = await fetch(DEV_GRAPHQL.replace('/v1/graphql', path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': devAdminSecret() },
    body: JSON.stringify(body),
  });
  expect(response.ok).toBe(true);
  return (await response.json()) as Row;
};

describe.skipIf(!DEV_STACK_ENABLED)('saved searches against the dev stack (Nova Tower)', () => {
  let provider: DataProvider;
  let me = '';
  let saved = '';
  const requests: string[] = [];

  const custom = (kind: 'mutation' | 'query', resource: string, operation: string, input: Row) => {
    const descriptor = { ...IDENTITY, kind: 'custom', ref: { namespace: 'default', id: operation }, resource, operation, input };
    return kind === 'mutation'
      ? provider.mutations?.custom?.(createMutationDescriptor(descriptor as never) as never, mutationContext())
      : provider.queries?.custom?.(createQueryDescriptor(descriptor as never) as never, queryContext());
  };
  const resource = (input: TestQueryInput) =>
    provider.queries?.[input.kind as 'one']?.(
      createQueryDescriptor({ ...IDENTITY, ref, resource: SAVED_SEARCH_RESOURCE, ...input } as never) as never,
      queryContext(),
    );
  const read = async (): Promise<Row> => ((await resource({ kind: 'one', id: saved })) as { data: Row }).data;
  const update = async (stored: Row, values: Row) =>
    custom('mutation', SAVED_SEARCH_BINDING, 'updateSavedSearch', { id: saved, set: savedSearchChangesOf(stored, values) });

  beforeAll(async () => {
    const auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    me = (await auth.getIdentity({} as never))?.id ?? '';
    expect(me).not.toBe('');
  }, 60_000);

  afterAll(async () => {
    if (saved !== '') {
      await provider.mutations
        ?.deleteOne?.(createMutationDescriptor({ ...IDENTITY, ref, resource: SAVED_SEARCH_RESOURCE, idField: 'id', kind: 'deleteOne', id: saved } as never) as never, mutationContext())
        .catch(() => undefined);
    }
    if (requests.length > 0) {
      const ids = requests.map((id) => `'${id}'`).join(', ');
      await adminRequest('/v2/query', { type: 'run_sql', args: { source: 'default', sql: `delete from itap.search_requests where id in (${ids})` } });
    }
  }, 60_000);

  it('should refuse a filter naming an unknown company with a sentence, saving nothing', async () => {
    const values = { search_type: 'attribute', photo: [], company_id: crypto.randomUUID(), max_results: 5, name: 'dev-test refused' };
    await expect(custom('mutation', SAVED_SEARCH_BINDING, 'createSavedSearch', savedSearchInsertOf(values))).rejects.toMatchObject({
      kind: 'validation',
      code: 'search_filters_invalid',
    });
  });

  it('should save, run now, keep the baseline on a settings edit, reset it on a search edit, and delete', async () => {
    const values = {
      search_type: 'attribute',
      photo: [],
      status: 'verified',
      max_results: 5,
      name: `dev-test saved search ${Date.now()}`,
      schedule_cron: '0 7 * * 1',
      alert_on_match: true,
    };
    const created = (await custom('mutation', SAVED_SEARCH_BINDING, 'createSavedSearch', savedSearchInsertOf(values))) as Row;
    saved = String(created.id);
    const stored = await read();
    expect(stored).toMatchObject({
      owner_id: me,
      search_type: 'attribute',
      filters: { status: ['verified'] },
      image_file_id: null,
      threshold: null,
      schedule_cron: '0 7 * * 1',
      last_search_request_id: null,
    });
    const { data: listed } = (await resource({ kind: 'list', pagination: offsetPage(1), filter: { field: 'id', op: 'eq', value: saved } })) as { data: Row[] };
    expect(listed.map((row) => row.id)).toEqual([saved]);

    // Run now: a search by hand with the stored definition, its results readable as the block reads them.
    const outcome = searchOutcome.parse(await custom('mutation', SEARCH_BINDING, 'searchFaces', runNowDefinitionOf(stored)));
    requests.push(outcome.search_request_id);
    const run = searchRun.parse(await custom('query', SEARCH_RESULTS_BINDING, 'searchRun', { requestId: outcome.search_request_id }));
    expect(run).toMatchObject({ status: 'completed', search_type: 'attribute', max_results: 5 });
    expect(run.results.length).toBeGreaterThan(0);
    expect(run.results.every((match) => match.identity?.status === 'verified')).toBe(true);
    expect((await read()).last_search_request_id).toBeNull();

    // The baseline, as the cron's completed run records it (finish_saved_search_run), set with the admin secret.
    const baseline = await adminRequest('/v1/graphql', {
      query: 'mutation ($id: uuid!, $request: uuid!) { update_saved_searches_by_pk(pk_columns: { id: $id }, _set: { last_search_request_id: $request }) { id } }',
      variables: { id: saved, request: outcome.search_request_id },
    });
    expect(baseline.errors).toBeUndefined();

    // Settings only: the search is not sent, the baseline stays.
    const withBaseline = await read();
    const renamed = { ...savedSearchValuesOf(withBaseline), name: `${values.name} (renamed)`, is_shared: true };
    expect(definitionChanged(withBaseline, renamed)).toBe(false);
    await update(withBaseline, renamed);
    expect(await read()).toMatchObject({ name: renamed.name, is_shared: true, last_search_request_id: outcome.search_request_id });

    // The search itself: the server resets the baseline in the same statement (Review Focus 5).
    const current = await read();
    const changed = { ...savedSearchValuesOf(current), max_results: 6 };
    expect(definitionChanged(current, changed)).toBe(true);
    const answer = (await update(current, changed)) as Row;
    expect(answer).toMatchObject({ id: saved, last_search_request_id: null });
    expect(await read()).toMatchObject({ max_results: 6, last_search_request_id: null });

    await provider.mutations?.deleteOne?.(
      createMutationDescriptor({ ...IDENTITY, ref, resource: SAVED_SEARCH_RESOURCE, idField: 'id', kind: 'deleteOne', id: saved } as never) as never,
      mutationContext(),
    );
    const { data: gone } = (await resource({ kind: 'list', pagination: offsetPage(1), filter: { field: 'id', op: 'eq', value: saved } })) as { data: Row[] };
    expect(gone).toEqual([]);
    saved = '';
  }, 60_000);
});
