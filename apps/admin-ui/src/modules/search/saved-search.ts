import { type Rule, type RuleContext, defineResource, isRecordProbe, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { searchResultsBlock } from '../../blocks/search-results/search-results-block';
import { resourceByName } from '../../data/resource-by-name';
import { SAVED_SEARCH_RESOURCE, SEARCH_REQUEST_RESOURCE } from '../../data/resource-names';
import { savedSearchFields } from './saved-search-fields';
import { editSavedSearchFlow, newSavedSearchFlow, runSavedSearchFlow } from './saved-search-flows';

type Row = Readonly<Record<string, unknown>> | null | undefined;

const lower = (value: unknown): string => (typeof value === 'string' ? value.toLowerCase() : '');

/** Whether the rule's record is a saved search someone else owns (shared with the member). */
export function someoneElses(ctx: Pick<RuleContext, 'record' | 'user'>): boolean {
  const row = ctx.record as Row;
  if (isRecordProbe(ctx.record) || typeof row?.id !== 'string' || row.id === '') return false;
  return lower(row.owner_id) !== lower(ctx.user.id);
}

/** Why a saved search shared by someone else cannot be changed (beside every disabled action). */
export const NOT_OWNER_REASON = 'Shared with you by its owner: only the owner can change or delete it.';
/** Why a face search shared by someone else cannot be run: its photo is the owner's. */
export const NOT_OWNER_PHOTO_REASON = 'Its photo is visible to its owner only, so only the owner can run this face search.';
/** Why a face search without its photo cannot be run. */
export const PHOTO_GONE_REASON = 'Its photo was deleted: edit the saved search and add a photo.';

const faceSearch = (ctx: Pick<RuleContext, 'record'>): boolean => (ctx.record as Row)?.search_type !== 'attribute';

/**
 * Only the owner changes or deletes a saved search (the database's permissions refuse the same);
 * a face search runs only with its photo, which only its owner can open; the photo and the runs
 * (search history is owner-only) are not shown to other members.
 */
export const SAVED_SEARCH_RULES: Rule[] = [
  {
    target: { kind: 'action', name: ['edit_search', 'delete'] },
    deny: 'run',
    when: someoneElses,
    fallback: 'disable',
    reason: NOT_OWNER_REASON,
  },
  {
    target: { kind: 'action', name: 'run_now' },
    deny: 'run',
    when: (ctx) => faceSearch(ctx) && someoneElses(ctx),
    fallback: 'disable',
    reason: NOT_OWNER_PHOTO_REASON,
  },
  {
    target: { kind: 'action', name: 'run_now' },
    deny: 'run',
    when: (ctx) => faceSearch(ctx) && !someoneElses(ctx) && !isRecordProbe(ctx.record) && (ctx.record as Row)?.image_file_id == null,
    fallback: 'disable',
    reason: PHOTO_GONE_REASON,
  },
  {
    target: { kind: 'field', name: ['image_file_id', 'last_search_request_id'] },
    deny: 'view',
    when: someoneElses,
  },
  {
    // The baseline, the last run's results and the runs are the owner's (owner-only search history).
    target: { kind: 'panel', name: ['baseline', 'last-run', 'runs'] },
    deny: 'view',
    when: someoneElses,
  },
];

/** The saved searches list's views. */
export const SAVED_SEARCH_VIEWS = [
  { id: 'scheduled', texts: 'Scheduled', state: { filters: [{ field: 'schedule_cron', op: 'nnull', value: true }] } },
  { id: 'alerting', texts: 'Alerting', state: { filters: [{ field: 'alert_on_match', op: 'eq', value: true }] } },
  { id: 'shared', texts: 'Shared', state: { filters: [{ field: 'is_shared', op: 'eq', value: true }] } },
  { id: 'failed', texts: 'Last run failed', state: { filters: [{ field: 'last_run_status', op: 'eq', value: 'failed' }] } },
];

/**
 * Saved searches (`itap.saved_searches`): a member's face or attribute searches kept to run again,
 * by hand (Run now) or on a schedule that can alert on new matches; private, or shared read-only
 * with the organization. A run is a search request of the owner's history; the page shows the last
 * scheduled run's results.
 */
export const savedSearch = defineResource(SAVED_SEARCH_RESOURCE, {
  texts: {
    label: 'Saved search',
    labelPlural: 'Saved searches',
    doc: {
      summary:
        'Face and attribute searches kept to run again, by hand or on a schedule that alerts on new matches; private, or shared read-only with the organization.',
    },
  },
  basePath: '/saved-searches',
  section: NAV_SECTIONS.search,
  order: 3,
  icon: NAV_ICONS.savedSearches,
  displayField: 'name',
  data: { provider: 'hasura' },
  operations: { create: false, edit: false },
  builtinActions: { edit: false },
  fields: savedSearchFields,
  rules: SAVED_SEARCH_RULES,
  actions: (r) => ({
    resource: [r.action.flow('new_saved_search', newSavedSearchFlow)],
    item: [r.action.flow('run_now', runSavedSearchFlow), r.action.flow('edit_search', editSavedSearchFlow)],
  }),
  views: {
    list: {
      columns: ['name', 'search_type', 'schedule_cron', 'alert_on_match', 'is_shared', 'owner_id', 'last_run_at', 'last_run_status'],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: [{ field: 'name', op: 'contains' }] },
      filters: { pinned: ['search_type'], fields: ['search_type', 'is_shared', 'alert_on_match', 'last_run_status', 'owner_id'] },
      savedViews: SAVED_SEARCH_VIEWS,
    },
    show: {
      header: (l) => [l.grid(['name', 'search_type', 'is_shared', 'owner_id'])],
      body: (l) => [
        l.panel(['owner_last_error'], {
          key: 'last-failure',
          tone: 'destructive',
          texts: { title: 'Last scheduled run did not search', description: 'The saved search moved on to its next run.' },
          when: l.present(l.ref('record', 'owner_last_error')),
        }),
        'description',
        l.panel(['image_file_id', 'filters', l.grid(['threshold', 'max_results', 'fuzzy'])], {
          key: 'definition',
          texts: { title: 'What it searches' },
        }),
        l.panel([l.grid(['schedule_cron', 'alert_on_match']), l.grid(['next_run_at', 'last_run_at', 'last_run_status'])], {
          key: 'schedule',
          texts: { title: 'Schedule and alerts' },
        }),
        l.panel(['last_search_request_id'], {
          key: 'baseline',
          tone: 'info',
          texts: {
            title: 'No alert baseline yet',
            description:
              'The next scheduled run records what it finds and alerts nothing; later runs alert on identities new since the run before. This is so after saving a search and after changing the search itself.',
          },
          when: l.all([l.equals(l.ref('record', 'alert_on_match'), true), l.not(l.present(l.ref('record', 'last_search_request_id')))]),
        }),
        l.panel(
          [l.place(searchResultsBlock, { key: 'last-results', props: { requestId: l.ref('record', 'last_search_request_id'), showHistoryLink: true } })],
          {
            key: 'last-run',
            texts: { title: 'Last scheduled run', description: 'What the last completed scheduled run found: the baseline for new-match alerts.' },
            when: l.present(l.ref('record', 'last_search_request_id')),
          },
        ),
        l.panel(
          [
            l.place(relatedList(resourceByName(SEARCH_REQUEST_RESOURCE)), {
              key: 'saved-search-runs',
              props: {
                where: [{ field: 'saved_search_id', op: 'eq', value: l.ref('record', 'id') }],
                columns: ['created_at', 'status', 'results_count', 'top_confidence'],
                open: 'page',
              },
            }),
          ],
          { key: 'runs', texts: { title: 'Scheduled runs', description: 'Every scheduled run, newest first; Run now goes to your search history.' } },
        ),
        l.grid(['created_at', 'updated_at']),
      ],
    },
  },
});
