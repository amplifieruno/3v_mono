import { type DataError, defineDataProvider, defineMutationHandler, enumValueText } from '@burojs/core';
import { answer, runFlow } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { confidenceText, searchOutcome, severalFaces } from '../../src/blocks/search-results/search-outcome';
import { withActionRefusals } from '../../src/data/action-refusals';
import { SEARCH_REQUEST_RESOURCE } from '../../src/data/resource-names';
import { SEARCH_MATCH_TYPE_ENUM, SEARCH_MATCH_TYPES } from '../../src/enums/search';
import { ACTION_REFUSALS } from '../../src/modules';
import {
  defaultSearchThreshold,
  matchTypeOf,
  rerunDefinitionOf,
  searchDefinitionOf,
  searchValuesOf,
} from '../../src/modules/search/search-definition';
import { SEARCH_BINDING } from '../../src/modules/search/search-ops';

/**
 * Search without the UI: the form's values become the action's input (filters only as filled in,
 * no photo, threshold or fuzzy for an attribute search), the default threshold is 1 − the
 * organization's recognition threshold within 0.2..0.95, match types follow §6.11, outcomes never
 * read as an empty result (Review Focus 1), and "Run again" repeats a past request's definition.
 */

const ADMIN = { id: 'u1', roles: ['org_admin'] };
const PHOTO = '77777777-7777-4777-8777-000000000001';
const COMPANY = '22222222-2222-4222-8222-000000000001';
const FACILITY = '33333333-3333-4333-8333-000000000001';
const REQUEST = '66666666-6666-4666-8666-000000000001';
const NEW_REQUEST = '66666666-6666-4666-8666-000000000002';

beforeAll(async () => {
  await app.ready;
});

describe('search definition', () => {
  const values = {
    search_type: 'combined',
    photo: [PHOTO],
    status: 'verified',
    linked: 'unlinked',
    profile_type: 'visitor',
    company_id: COMPANY,
    gender: 'female',
    age_min: 20,
    age_max: 40,
    first_seen_from: null,
    first_seen_to: '',
    last_seen_from: '2026-10-01T00:00:00.000Z',
    last_seen_to: null,
    facility_id: FACILITY,
    seen_from: '2026-10-20T08:00:00.000Z',
    seen_to: '2026-10-20T18:00:00.000Z',
    threshold: 0.55,
    max_results: 10,
    fuzzy: true,
  };

  it('should send a facial search with its photo, filled filters, threshold and fuzzy', () => {
    expect(searchDefinitionOf(values)).toEqual({
      search_type: 'combined',
      image_file_id: PHOTO,
      filters: {
        status: ['verified'],
        linked: false,
        profile_type: ['visitor'],
        company_id: COMPANY,
        gender: 'female',
        facility_id: FACILITY,
        age_min: 20,
        age_max: 40,
        last_seen_from: '2026-10-01T00:00:00.000Z',
        seen_from: '2026-10-20T08:00:00.000Z',
        seen_to: '2026-10-20T18:00:00.000Z',
      },
      threshold: 0.55,
      max_results: 10,
      fuzzy: true,
    });
  });

  it('should send an attribute search without photo, threshold or fuzzy', () => {
    expect(searchDefinitionOf({ ...values, search_type: 'attribute', linked: 'linked' })).toMatchObject({
      search_type: 'attribute',
      image_file_id: null,
      threshold: null,
      fuzzy: false,
      filters: expect.objectContaining({ linked: true }),
    });
  });

  it('should leave an empty threshold to the organization default and send no empty filter', () => {
    expect(searchDefinitionOf({ search_type: 'facial', photo: [PHOTO], threshold: null })).toEqual({
      search_type: 'facial',
      image_file_id: PHOTO,
      filters: {},
      threshold: null,
      max_results: 20,
      fuzzy: false,
    });
  });

  it('should read a stored definition back into the form', () => {
    const definition = searchDefinitionOf(values);
    expect(searchDefinitionOf(searchValuesOf(definition))).toEqual(definition);
    expect(searchValuesOf({ search_type: 'attribute', filters: { status: ['verified', 'unverified'] } })).toMatchObject({
      status: 'verified',
      photo: [],
      max_results: 20,
    });
  });

  it('should default the threshold to 1 − the recognition threshold, within 0.2..0.95', () => {
    expect(defaultSearchThreshold(0.5)).toBe(0.5);
    expect(defaultSearchThreshold(0.4)).toBe(0.6);
    expect(defaultSearchThreshold(0.35)).toBe(0.65);
    expect(defaultSearchThreshold(0.9)).toBe(0.2);
    expect(defaultSearchThreshold(0.01)).toBe(0.95);
    expect(defaultSearchThreshold(null)).toBe(0.5);
  });
});

describe('match types (§6.11)', () => {
  it('should be exact from threshold + 0.15, partial from the threshold, fuzzy below', () => {
    expect(matchTypeOf(0.75, 0.6)).toBe('exact');
    expect(matchTypeOf(0.74, 0.6)).toBe('partial');
    expect(matchTypeOf(0.6, 0.6)).toBe('partial');
    expect(matchTypeOf(0.55, 0.6)).toBe('fuzzy');
  });

  it('should label every match type', () => {
    const def = app.registry.enums.get(SEARCH_MATCH_TYPE_ENUM);
    expect(SEARCH_MATCH_TYPES.map((value) => enumValueText(def, value))).toEqual(['Exact', 'Partial', 'Fuzzy']);
  });
});

describe('search outcome (Review Focus 1)', () => {
  it('should name why a photo was not searched instead of an empty result', () => {
    expect(searchOutcome({ status: 'failed', error: 'no_face', results_count: 0 })).toEqual({ kind: 'photo', reason: 'no_face' });
    expect(searchOutcome({ status: 'failed', error: 'low_quality', results_count: 0 })).toEqual({ kind: 'photo', reason: 'low_quality' });
    expect(searchOutcome({ status: 'failed', error: 'error: boom', results_count: 0 })).toEqual({ kind: 'error', detail: 'error: boom' });
    expect(searchOutcome({ status: 'completed', error: null, results_count: 0 })).toEqual({ kind: 'none' });
    expect(searchOutcome({ status: 'completed', error: null, results_count: 3 })).toEqual({ kind: 'found', count: 3 });
    expect(searchOutcome({ status: 'running', error: null, results_count: 0 })).toEqual({ kind: 'pending' });
  });

  it('should say when several faces were in the photo', () => {
    expect(severalFaces(3)).toBe(true);
    expect(severalFaces(1)).toBe(false);
    expect(severalFaces(null)).toBe(false);
    expect(confidenceText(0.873)).toBe('87%');
  });
});

describe('run again', () => {
  const past = {
    id: REQUEST,
    search_type: 'facial',
    image_file_id: PHOTO,
    filters: { gender: 'male', status: ['verified', 'unverified'] },
    threshold: 0.6,
    max_results: 20,
    fuzzy: false,
    status: 'completed',
    created_at: '2026-10-22T09:00:00Z',
  };

  it('should repeat the photo and filters as stored, with the adjusted threshold', () => {
    expect(rerunDefinitionOf(past, { threshold: 0.45, max_results: 5, fuzzy: true })).toEqual({
      search_type: 'facial',
      image_file_id: PHOTO,
      filters: { gender: 'male', status: ['verified', 'unverified'] },
      threshold: 0.45,
      max_results: 5,
      fuzzy: true,
    });
    expect(rerunDefinitionOf({ ...past, search_type: 'attribute', image_file_id: null, threshold: null }, { max_results: 7 })).toMatchObject({
      image_file_id: null,
      threshold: null,
      fuzzy: false,
      max_results: 7,
    });
  });

  const rerun = (record: Record<string, unknown>) =>
    runFlow(app, { resource: SEARCH_REQUEST_RESOURCE, action: 'run_again' }, {
      user: ADMIN,
      record,
      rows: { [SEARCH_REQUEST_RESOURCE]: [record] },
      mutations: {
        'itap:search-faces': [
          answer({ search_request_id: NEW_REQUEST, status: 'completed', results_count: 1, top_confidence: 0.8, duration_ms: 90, face_count: 1, error: null }),
        ],
      },
    });

  it('should run a past search again through search_faces', async () => {
    const flow = (await rerun(past).open()).fill({ threshold: 0.5 });
    await flow.submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({
      input: { search_type: 'facial', image_file_id: PHOTO, threshold: 0.5, max_results: 20, filters: past.filters },
    });
  });

  it('should not offer Run again on a face search whose photo is gone', async () => {
    (await rerun({ ...past, image_file_id: null }).open()).assertUnavailable();
  });

  it('should run an attribute search again with its own limit only', async () => {
    const attribute = { ...past, search_type: 'attribute', image_file_id: null, threshold: null };
    (await rerun(attribute).open()).assertUnavailable();
    const flow = (
      await runFlow(app, { resource: SEARCH_REQUEST_RESOURCE, action: 'run_attributes_again' }, {
        user: ADMIN,
        record: attribute,
        rows: { [SEARCH_REQUEST_RESOURCE]: [attribute] },
        mutations: {
          'itap:search-faces': [
            answer({ search_request_id: NEW_REQUEST, status: 'completed', results_count: 0, top_confidence: null, duration_ms: 9, face_count: null, error: null }),
          ],
        },
      }).open()
    ).fill({ max_results: 50 });
    await flow.submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({
      input: { search_type: 'attribute', image_file_id: null, threshold: null, fuzzy: false, max_results: 50 },
    });
  });
});

describe('search refusals', () => {
  const failing = (code: string, message: string) =>
    withActionRefusals(
      defineDataProvider({
        mutations: {
          custom: defineMutationHandler(async () =>
            Promise.reject({ kind: 'sent', code: 'unexpected', message, details: [{ message, extensions: { code } }] } satisfies DataError),
          ),
        },
      }),
      ACTION_REFUSALS,
    );
  const refused = (code: string, message = '') =>
    failing(code, message).mutations?.custom?.({ kind: 'custom', resource: SEARCH_BINDING, operation: 'searchFaces', input: {} } as never, {} as never);

  it('should read the action’s refusals as sentences on the form', async () => {
    await expect(refused('invalid_filters')).rejects.toMatchObject({ kind: 'validation', code: 'invalid_filters' });
    await expect(refused('file_not_found')).rejects.toMatchObject({ kind: 'validation', code: 'file_not_found' });
    await expect(refused('invalid_input', 'threshold: expected 0.2..0.95')).rejects.toMatchObject({
      kind: 'validation',
      details: { issues: [expect.objectContaining({ message: expect.objectContaining({ default: expect.stringContaining('threshold: expected 0.2..0.95') }) })] },
    });
    await expect(refused('internal', 'boom')).rejects.toMatchObject({ kind: 'sent' });
  });
});
