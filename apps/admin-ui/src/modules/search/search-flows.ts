import { type FlowConfig, type Layout, cond, ref, source } from '@burojs/core';
import { NAV_ICONS } from '../../app/nav';
import { searchResultsBlock } from '../../blocks/search-results/search-results-block';
import { SEARCH_RANGES, rangeReversed, rerunDefinitionOf, searchDefinitionOf } from './search-definition';
import { searchFields, searchFormBody } from './search-fields';
import { searchDefaults, searchFaces } from './search-ops';
import { rememberSent, searchRan } from './search-sent';

const RANGE_TEXTS = {
  age: 'The age range ends before it starts.',
  firstSeen: 'The first-seen window ends before it starts.',
  lastSeen: 'The last-seen window ends before it starts.',
  seen: 'The visit window ends before it starts.',
} as const;

/** One error check per range the database refuses reversed (`itap.valid_search_filters`). */
export const searchRangeChecks = SEARCH_RANGES.map((range) => ({
  id: `searchRange_${range.id}`,
  severity: 'error' as const,
  anchor: range.to,
  when: ({ values }: { readonly values: Readonly<Record<string, unknown>> }) => rangeReversed(values, range),
  texts: RANGE_TEXTS[range.id],
}));

/**
 * "Search" (`search_faces`), drawn in place on the Search page (an item flow of the search
 * workspace, `./search-workspace.ts`): the form, then the outcome and the results in place of it
 * (`itap:search-results`); "Done" starts a new search. The threshold starts at the organization's
 * default.
 */
export const searchFlow = {
  texts: {
    label: 'Search',
    doc: {
      summary:
        'Finds identities by a face photo, by attributes, or both. Every search is kept in your own search history, where you can run it again.',
    },
  },
  icon: NAV_ICONS.faceSearch,
  // Only where the Search page places it inline.
  surfaces: { default: false },
  with: { defaults: source.query(searchDefaults, {}) },
  form: {
    fields: searchFields,
    initial: {
      search_type: { kind: 'literal', value: 'facial' },
      photo: { kind: 'literal', value: [] },
      threshold: ref('defaults', 'threshold'),
      max_results: { kind: 'literal', value: 20 },
      fuzzy: { kind: 'literal', value: false },
    },
    body: searchFormBody,
  },
  checks: searchRangeChecks,
  submit: {
    mutation: searchFaces,
    retry: 'never',
    input: ({ values }) => rememberSent(searchDefinitionOf(values)),
    onUnknown: { check: searchRan },
  },
  then: {
    open: { block: searchResultsBlock, props: { requestId: ref('result', 'search_request_id'), showHistoryLink: true } },
  },
} satisfies FlowConfig<unknown, Record<never, never>, typeof searchFields>;

const rerunFields = {
  threshold: searchFields.threshold,
  max_results: searchFields.max_results,
  fuzzy: searchFields.fuzzy,
};

const RERUN_TEXTS = {
  label: 'Run again',
  doc: {
    summary:
      'Runs the search again against today’s identities, with the same photo and filters; adjust the limits first if you like. The new run is added to your history.',
  },
};

const rerunSubmit = {
  mutation: searchFaces,
  retry: 'never' as const,
  input: ({ values, record }: { readonly values: Readonly<Record<string, unknown>>; readonly record?: unknown }) =>
    rememberSent(rerunDefinitionOf((record ?? {}) as Readonly<Record<string, unknown>>, values)),
  onUnknown: { check: searchRan },
};

const searchType = ref('record', 'search_type');

/**
 * "Run again" on a past face search: the same photo and filters, with the threshold, result limit
 * and fuzzy matches to adjust; the new request's page opens with its results. Not offered once
 * the photo was deleted. (A form cannot hide a field by the record, so attribute searches have
 * their own flow, {@link rerunAttributeSearchFlow}.)
 */
export const rerunSearchFlow = {
  texts: RERUN_TEXTS,
  icon: NAV_ICONS.runSearchAgain,
  surfaces: { default: 'menu', show: 'auto', row: 'menu' },
  when: cond.all([cond.not(cond.equals(searchType, 'attribute')), cond.present(ref('record', 'image_file_id'))]),
  form: {
    fields: rerunFields,
    initial: {
      threshold: ref('record', 'threshold'),
      max_results: ref('record', 'max_results'),
      fuzzy: ref('record', 'fuzzy'),
    },
    body: (l: Layout<typeof rerunFields>) => [l.grid(['threshold', 'max_results', 'fuzzy'])],
  },
  submit: rerunSubmit,
  then: { open: { id: ref('result', 'search_request_id') } },
} satisfies FlowConfig<unknown, Record<never, never>, typeof rerunFields>;

const rerunAttributeFields = { max_results: searchFields.max_results };

/** "Run again" on a past attribute search: the same filters, with the result limit to adjust. */
export const rerunAttributeSearchFlow = {
  texts: RERUN_TEXTS,
  icon: NAV_ICONS.runSearchAgain,
  surfaces: { default: 'menu', show: 'auto', row: 'menu' },
  when: cond.equals(searchType, 'attribute'),
  form: { fields: rerunAttributeFields, initial: { max_results: ref('record', 'max_results') } },
  submit: rerunSubmit,
  then: { open: { id: ref('result', 'search_request_id') } },
} satisfies FlowConfig<unknown, Record<never, never>, typeof rerunAttributeFields>;
