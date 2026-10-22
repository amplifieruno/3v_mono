import { defineResource } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { searchResultsBlock } from '../../blocks/search-results/search-results-block';
import { SEARCH_REQUEST_RESOURCE } from '../../data/resource-names';
import { rerunAttributeSearchFlow, rerunSearchFlow } from './search-flows';
import { searchRequestFields } from './search-request-fields';

/** The search history's views. */
export const SEARCH_SAVED_VIEWS = [
  { id: 'facial', texts: 'Face searches', state: { filters: [{ field: 'search_type', op: 'in', value: ['facial', 'combined'] }] } },
  { id: 'failed', texts: 'Failed', state: { filters: [{ field: 'status', op: 'eq', value: 'failed' }] } },
];

/** A request's title: its type and time (`Face search, Oct 22, 2026, 09:05`). */
function requestTitle(record: Readonly<Record<string, unknown>>): string | null {
  const at = typeof record.created_at === 'string' ? Date.parse(record.created_at) : Number.NaN;
  if (Number.isNaN(at)) return null;
  const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(at);
  return `${record.search_type === 'attribute' ? 'Attribute search' : 'Face search'}, ${when}`;
}

/**
 * Search history (`itap.search_requests`): every search the signed-in member ran, by hand or by
 * one of their saved searches, newest first; nobody else's (owner-only rows). A request's page
 * shows its outcome and results again; "Run again" repeats it. History is never edited or deleted
 * from the console; retention removes old requests.
 */
export const searchRequest = defineResource(SEARCH_REQUEST_RESOURCE, {
  texts: {
    label: 'Search',
    labelPlural: 'Search history',
    doc: {
      summary:
        'Your own face and attribute searches, with their outcome and results, newest first. Only you see them.',
    },
  },
  basePath: '/search-history',
  section: NAV_SECTIONS.search,
  order: 2,
  icon: NAV_ICONS.searchHistory,
  displayField: 'created_at',
  recordTitle: requestTitle,
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: searchRequestFields,
  actions: (r) => ({
    item: [r.action.flow('run_again', rerunSearchFlow), r.action.flow('run_attributes_again', rerunAttributeSearchFlow)],
  }),
  views: {
    list: {
      columns: ['created_at', 'search_type', 'status', 'results_count', 'top_confidence', 'threshold'],
      defaultSort: [{ field: 'created_at', direction: 'desc' }],
      filters: { pinned: ['status', 'search_type'], fields: ['status', 'search_type', 'created_at'] },
      savedViews: SEARCH_SAVED_VIEWS,
    },
    show: {
      header: (l) => [l.grid(['search_type', 'status', 'created_at'])],
      body: (l) => [
        l.place(searchResultsBlock, { key: 'results', props: { requestId: l.ref('record', 'id') } }),
        l.panel(
          [
            l.grid(['image_file_id', 'face_count']),
            'filters',
            l.grid(['threshold', 'max_results', 'fuzzy']),
            l.grid(['results_count', 'top_confidence', 'duration_ms']),
            'error',
          ],
          { key: 'definition', texts: { title: 'How it was run' } },
        ),
      ],
    },
  },
});
