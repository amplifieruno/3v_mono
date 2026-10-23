import { type DataError, defineDataProvider, defineMutationHandler } from '@burojs/core';
import { answer, runFlow } from '@burojs/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { SEARCH_POLL_LIMIT_MS, searchPolling } from '../../src/blocks/search-results/search-outcome';
import { withActionRefusals } from '../../src/data/action-refusals';
import { pollWhile } from '../../src/data/poll-while';
import { SAVED_SEARCH_RESOURCE } from '../../src/data/resource-names';
import { type SearchFilterNamer, searchFilterParts } from '../../src/fields/search-filters-format';
import { ACTION_REFUSALS } from '../../src/modules';
import { isSavedSearchOf } from '../../src/modules/search/saved-search-flows';
import { SAVED_SEARCH_BINDING } from '../../src/modules/search/saved-search-ops';
import {
  definitionChanged,
  savedSearchChangesOf,
  savedSearchInsertOf,
  savedSearchValuesOf,
} from '../../src/modules/search/saved-search-shape';
import { forgetSent, isRunOf, rememberSent, searchRan } from '../../src/modules/search/search-sent';

/**
 * Saved searches without the UI: the form's values and the row, an edit sending the search only
 * when it changed (so the server resets the baseline only then, Review Focus 5), Run now sending
 * the stored definition and offered only where it can run, the filters in words, "Check again"
 * after a lost search answer, and the refusals of a saved search's write.
 */

const OWNER = { id: 'user-1', roles: ['org_admin'] };
const PHOTO = '77777777-7777-4777-8777-000000000001';
const COMPANY = '22222222-2222-4222-8222-000000000001';
const FACILITY = '33333333-3333-4333-8333-000000000001';
const SAVED = '55555555-5555-4555-8555-000000000001';
const REQUEST = '66666666-6666-4666-8666-000000000001';

const row = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: SAVED,
  name: 'Night visitors',
  description: null,
  search_type: 'facial',
  image_file_id: PHOTO,
  filters: { status: ['verified', 'unverified'], company_id: COMPANY },
  threshold: 0.6,
  max_results: 20,
  fuzzy: false,
  is_shared: false,
  schedule_cron: '0 7 * * 1',
  alert_on_match: true,
  owner_id: 'user-1',
  ...overrides,
});

beforeAll(async () => {
  await app.ready;
});

afterEach(() => forgetSent());

describe('saved search shape', () => {
  it('should write a new saved search with its settings and the whole definition', () => {
    const values = { ...savedSearchValuesOf(row()), name: '  Lobby  ', description: ' ', schedule_cron: '' };
    expect(savedSearchInsertOf(values)).toEqual({
      name: 'Lobby',
      description: null,
      is_shared: false,
      schedule_cron: null,
      alert_on_match: true,
      search_type: 'facial',
      image_file_id: PHOTO,
      filters: { status: ['verified'], company_id: COMPANY },
      threshold: 0.6,
      max_results: 20,
      fuzzy: false,
    });
  });

  it('should send only the settings when the search is unchanged, keeping a stored filter of several statuses', () => {
    const stored = row();
    const values = { ...savedSearchValuesOf(stored), name: 'Renamed', is_shared: true };
    expect(definitionChanged(stored, values)).toBe(false);
    expect(savedSearchChangesOf(stored, values)).toEqual({
      name: 'Renamed',
      description: null,
      is_shared: true,
      schedule_cron: '0 7 * * 1',
      alert_on_match: true,
    });
  });

  it('should send the definition when the search changed (the server then resets the baseline)', () => {
    const stored = row();
    for (const change of [{ threshold: 0.7 }, { max_results: 5 }, { fuzzy: true }, { company_id: null }, { photo: [] }]) {
      const values = { ...savedSearchValuesOf(stored), ...change };
      expect(definitionChanged(stored, values), JSON.stringify(change)).toBe(true);
      expect(savedSearchChangesOf(stored, values)).toHaveProperty('search_type', 'facial');
    }
  });

  it('should keep an attribute search without photo, threshold or fuzzy', () => {
    const stored = row({ search_type: 'attribute', image_file_id: null, threshold: null, filters: {} });
    expect(definitionChanged(stored, savedSearchValuesOf(stored))).toBe(false);
    expect(savedSearchValuesOf(stored)).toMatchObject({ photo: [], threshold: null, fuzzy: false });
  });
});

describe('Run now', () => {
  const runNow = (record: Record<string, unknown>, user = OWNER) =>
    runFlow(app, { resource: SAVED_SEARCH_RESOURCE, action: 'run_now' }, {
      user,
      record,
      rows: { [SAVED_SEARCH_RESOURCE]: [record] },
      mutations: {
        'itap:search-faces': [
          answer({ search_request_id: REQUEST, status: 'completed', results_count: 1, top_confidence: 0.9, duration_ms: 50, face_count: 1, error: null }),
        ],
      },
    });

  it('should send the stored definition, unchanged', async () => {
    const flow = await runNow(row()).open();
    await flow.submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({
      input: { search_type: 'facial', image_file_id: PHOTO, filters: row().filters, threshold: 0.6, max_results: 20, fuzzy: false },
    });
  });

  it('should not run someone else’s face search (its photo is theirs) nor a face search without its photo', async () => {
    (await runNow(row({ owner_id: 'user-2' })).open()).assertDisabled(/only the owner can run this face search/u);
    (await runNow(row({ image_file_id: null })).open()).assertDisabled(/photo was deleted/u);
  });

  it('should run someone else’s shared attribute search', async () => {
    const flow = await runNow(row({ owner_id: 'user-2', search_type: 'attribute', image_file_id: null, threshold: null })).open();
    await flow.submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { search_type: 'attribute', image_file_id: null, threshold: null, fuzzy: false } });
  });
});

describe('filters in words', () => {
  const namer: SearchFilterNamer = {
    text: (key, params) => `${key}${params === undefined ? '' : JSON.stringify(params)}`,
    enumLabel: (enumName, value) => `${enumName}:${value}`,
    name: (kind, id) => (kind === 'company' && id === COMPANY ? 'Acme Corp' : null),
    dateTime: (iso) => `at ${iso}`,
  };

  it('should name enum values, the company and the facility, and read ranges', () => {
    const parts = searchFilterParts(
      {
        status: ['verified', 'unverified'],
        linked: false,
        company_id: COMPANY,
        facility_id: FACILITY,
        age_min: 20,
        age_max: 40,
        last_seen_from: '2026-10-01T00:00:00Z',
        seen_to: '2026-10-20T18:00:00Z',
        colour: 'blue',
      },
      namer,
    );
    expect(parts.map((part) => [part.key, part.value])).toEqual([
      ['status', 'identity_status:verified, identity_status:unverified'],
      ['linked', 'search_linked:unlinked'],
      ['company_id', 'Acme Corp'],
      ['age', 'between{"from":"20","to":"40"}'],
      ['lastSeen', 'from{"from":"at 2026-10-01T00:00:00Z"}'],
      ['facility_id', 'unknownFacility'],
      ['seen', 'until{"to":"at 2026-10-20T18:00:00Z"}'],
      ['colour', '"blue"'],
    ]);
    expect(parts[0]?.label).toBe('labels.status');
  });

  it('should list nothing for empty or unreadable filters', () => {
    expect(searchFilterParts({}, namer)).toEqual([]);
    expect(searchFilterParts(null, namer)).toEqual([]);
  });
});

describe('Check again after a lost search answer', () => {
  const definition = { search_type: 'attribute' as const, image_file_id: null, filters: { gender: 'female' }, threshold: null, max_results: 20, fuzzy: false };
  const stored = { search_type: 'attribute', image_file_id: null, filters: { gender: 'female' }, threshold: null, max_results: 20, fuzzy: false };

  it('should match a request only with the very definition sent', () => {
    expect(isRunOf(stored, definition)).toBe(true);
    expect(isRunOf({ ...stored, max_results: 21 }, definition)).toBe(false);
    expect(isRunOf({ ...stored, filters: { gender: 'male' } }, definition)).toBe(false);
    expect(isRunOf({ ...stored, search_type: 'facial', threshold: 0.5 }, { ...definition, search_type: 'facial', threshold: 0.5 })).toBe(true);
    // An empty threshold became the organization's default on the server.
    expect(isRunOf({ ...stored, search_type: 'facial', threshold: 0.55 }, { ...definition, search_type: 'facial' })).toBe(true);
  });

  it('should read only the member’s runs by hand since shortly before it was sent', async () => {
    const lists: unknown[] = [];
    const data = (rows: readonly Record<string, unknown>[]) =>
      ({ list: async (_: unknown, params: unknown) => (lists.push(params), { data: rows }) }) as never;
    expect(await searchRan({ data: data([stored]) } as never)).toBe('unknown');
    rememberSent(definition, Date.parse('2026-10-22T10:00:00Z'));
    expect(await searchRan({ data: data([{ ...stored, max_results: 5 }]) } as never)).toBe('not-applied');
    expect(await searchRan({ data: data([stored]) } as never)).toBe('applied');
    // Only the newest run is judged: an identical older one behind a different newer one is not it.
    expect(await searchRan({ data: data([{ ...stored, max_results: 5 }, stored]) } as never)).toBe('not-applied');
    expect(lists[0]).toMatchObject({
      filter: {
        and: [
          { field: 'created_at', op: 'gte', value: '2026-10-22T09:59:45.000Z' },
          { field: 'search_type', op: 'eq', value: 'attribute' },
          { field: 'saved_search_id', op: 'isNull' },
          { field: 'bulk_job_id', op: 'isNull' },
        ],
      },
    });
  });
});

describe('Check again after a lost "New saved search" answer', () => {
  it('should take a saved search of the same name for the one sent only when it is the same search', () => {
    const sent = savedSearchInsertOf(savedSearchValuesOf(row()));
    const stored = row({ filters: { company_id: COMPANY, status: ['verified', 'unverified'] } });
    expect(isSavedSearchOf(stored, sent)).toBe(false); // the form keeps one status (G64): not the stored row
    const own = { ...stored, filters: sent.filters };
    expect(isSavedSearchOf(own, sent)).toBe(true);
    expect(isSavedSearchOf({ ...own, is_shared: true }, sent)).toBe(false);
    expect(isSavedSearchOf({ ...own, search_type: 'combined' }, sent)).toBe(false);
    expect(isSavedSearchOf({ ...own, schedule_cron: null }, sent)).toBe(false);
    expect(isSavedSearchOf({ ...own, max_results: 5 }, sent)).toBe(false);
  });
});

describe('polling the results block', () => {
  it('should read again while the request is queued or running, and stop after', () => {
    const now = Date.parse('2026-10-22T10:00:00Z');
    const fresh = new Date(now - 5_000).toISOString();
    const interval = pollWhile((run: { status: string; created_at: string } | undefined) => searchPolling(run, now), 1500) as unknown as (query: {
      state: { data: unknown };
    }) => number | false;
    expect(interval({ state: { data: { status: 'running', created_at: fresh } } })).toBe(1500);
    expect(interval({ state: { data: { status: 'queued', created_at: fresh } } })).toBe(1500);
    expect(interval({ state: { data: { status: 'completed', created_at: fresh } } })).toBe(false);
    expect(interval({ state: { data: null } })).toBe(false);
  });

  it('should stop reading a request that stays queued or running for two minutes', () => {
    const now = Date.parse('2026-10-22T10:00:00Z');
    const madeAgo = (ms: number) => ({ status: 'queued', created_at: new Date(now - ms).toISOString() });
    expect(searchPolling(madeAgo(SEARCH_POLL_LIMIT_MS - 1000), now)).toBe(true);
    expect(searchPolling(madeAgo(SEARCH_POLL_LIMIT_MS + 1000), now)).toBe(false);
  });
});

describe('saved search refusals', () => {
  const refused = (message: string) =>
    withActionRefusals(
      defineDataProvider({
        mutations: {
          custom: defineMutationHandler(async () =>
            Promise.reject({ kind: 'sent', code: 'constraint-violation', message, details: [{ message, extensions: { code: 'constraint-violation' } }] } satisfies DataError),
          ),
        },
      }),
      ACTION_REFUSALS,
    ).mutations?.custom?.({ kind: 'custom', resource: SAVED_SEARCH_BINDING, operation: 'createSavedSearch', input: {} } as never, {} as never);

  it('should read the guards’ codes and the table’s checks as sentences', async () => {
    await expect(refused('Check constraint violation. search_filters_invalid')).rejects.toMatchObject({ kind: 'validation', code: 'search_filters_invalid' });
    await expect(
      refused('Check constraint violation. new row for relation "saved_searches" violates check constraint "saved_searches_cron_valid"'),
    ).rejects.toMatchObject({ kind: 'validation', code: 'saved_searches_cron_valid' });
  });
});
