import { type Layout, type Rule, type RuleContext, defineResource, isRecordProbe, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { bulkJobProgressBlock } from '../../blocks/bulk-job-progress/bulk-job-progress-block';
import { resourceByName } from '../../data/resource-by-name';
import { BULK_JOB_RESOURCE, BULK_JOB_ROW_RESOURCE } from '../../data/resource-names';
import { BULK_SUCCEEDED_OUTCOMES } from '../../enums/bulk';
import { bulkJobFields } from './bulk-job-fields';
import { bulkSearchFlow, cancelBulkJobFlow, importProfilesFlow, retryBulkJobFlow, updateProfilesFlow } from './bulk-job-flows';
import { PROFILE_ROW_COLUMNS, SEARCH_ROW_COLUMNS } from './bulk-job-row';

type Row = Readonly<Record<string, unknown>> | null | undefined;

/** Whether the rule's record is a job someone else started (an organization's profile job). */
function someoneElses(ctx: Pick<RuleContext, 'record' | 'user'>): boolean {
  const row = ctx.record as Row;
  if (isRecordProbe(ctx.record) || typeof row?.id !== 'string' || row.id === '') return false;
  return String(row.owner_id ?? '').toLowerCase() !== String(ctx.user.id).toLowerCase();
}

/** Why a job whose input file is gone cannot run again. */
export const INPUT_GONE_REASON = 'Its input file was deleted, so it cannot run again: start a new job with the file.';

/**
 * The input file is its uploader's only (owner-only file kind), so it is not offered to others; a
 * job whose input file was deleted cannot be retried.
 */
export const BULK_JOB_RULES: Rule[] = [
  { target: { kind: 'field', name: 'input_file_id' }, deny: 'view', when: someoneElses },
  {
    target: { kind: 'action', name: 'retry' },
    deny: 'run',
    when: (ctx) => !isRecordProbe(ctx.record) && typeof (ctx.record as Row)?.id === 'string' && (ctx.record as Row)?.input_file_id == null,
    fallback: 'disable',
    reason: INPUT_GONE_REASON,
  },
];

/** The bulk jobs list's views. */
export const BULK_JOB_VIEWS = [
  { id: 'running', texts: 'Running', state: { filters: [{ field: 'status', op: 'in', value: ['queued', 'running'] }] } },
  { id: 'with-failures', texts: 'With failed rows', state: { filters: [{ field: 'failed', op: 'gt', value: 0 }] } },
  { id: 'searches', texts: 'Bulk searches', state: { filters: [{ field: 'kind', op: 'eq', value: 'bulk_search' }] } },
];

type JobLayout = Layout<typeof bulkJobFields>;

/** One tab of rows: a profile job's columns or a bulk search's, by the job's kind. */
function rowsTab(l: JobLayout, key: string, title: string, outcomes: readonly string[] | null) {
  const job = l.ref('record', 'id');
  const kind = l.ref('record', 'kind');
  const where = [
    { field: 'bulk_job_id', op: 'eq' as const, value: job },
    ...(outcomes === null ? [] : [{ field: 'outcome', op: 'in' as const, value: [...outcomes] }]),
  ];
  const list = (suffix: string, columns: readonly string[], search: boolean) =>
    l.place(relatedList(resourceByName(BULK_JOB_ROW_RESOURCE)), {
      key: `${key}-${suffix}`,
      when: search ? l.equals(kind, 'bulk_search') : l.not(l.equals(kind, 'bulk_search')),
      props: { where, columns: [...columns], open: 'page' },
    });
  return l.panel([list('profiles', PROFILE_ROW_COLUMNS, false), list('searches', SEARCH_ROW_COLUMNS, true)], { key, texts: title });
}

/**
 * Bulk jobs (`itap.bulk_jobs`): profile imports and updates from a CSV file, and bulk face searches
 * from photos, run in the background row by row. The page follows a job live, lists its rows by
 * outcome with each failed row's reason, offers Cancel while it runs and Retry when rows failed, and
 * opens the result file. A job is history: never edited or deleted.
 */
export const bulkJob = defineResource(BULK_JOB_RESOURCE, {
  texts: {
    label: 'Bulk job',
    labelPlural: 'Bulk jobs',
    doc: {
      summary:
        'Profile imports and updates from a CSV file, and face searches of many photos at once, run in the background row by row with each row’s outcome.',
    },
  },
  basePath: '/bulk-jobs',
  section: NAV_SECTIONS.search,
  order: 4,
  icon: NAV_ICONS.bulkJobs,
  displayField: 'code',
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: bulkJobFields,
  rules: BULK_JOB_RULES,
  actions: (r) => ({
    resource: [r.action.flow('import_profiles', importProfilesFlow), r.action.flow('update_profiles', updateProfilesFlow), r.action.flow('bulk_search', bulkSearchFlow)],
    item: [r.action.flow('cancel', cancelBulkJobFlow), r.action.flow('retry', retryBulkJobFlow)],
  }),
  views: {
    list: {
      columns: ['code', 'kind', 'status', 'total', 'succeeded', 'failed', 'skipped', 'owner_id', 'created_at', 'completed_at'],
      defaultSort: [{ field: 'created_at', direction: 'desc' }],
      search: { fields: ['code'] },
      filters: { pinned: ['status', 'kind'], fields: ['status', 'kind', 'owner_id', 'created_at'] },
      savedViews: BULK_JOB_VIEWS,
    },
    show: {
      header: (l) => [l.grid(['code', 'kind', 'status', 'owner_id'])],
      body: (l) => {
        const status = l.ref('record', 'status');
        return [
          l.panel(['error'], {
            key: 'job-failed',
            tone: 'destructive',
            texts: { title: 'The job failed', description: 'Fix the cause, then Retry; rows that succeeded are kept.' },
            when: l.present(l.ref('record', 'error')),
          }),
          l.place(bulkJobProgressBlock, { key: 'progress', props: { jobId: l.ref('record', 'id'), status } }),
          l.panel(['result_file_id'], {
            key: 'result',
            texts: { title: 'Result file', description: 'Every row with its outcome, as CSV.' },
            when: l.present(l.ref('record', 'result_file_id')),
          }),
          l.tabs(
            [
              rowsTab(l, 'failed-rows', 'Failed rows', ['failed']),
              rowsTab(l, 'succeeded-rows', 'Succeeded', BULK_SUCCEEDED_OUTCOMES),
              rowsTab(l, 'all-rows', 'All rows', null),
              l.panel(['input_file_id', 'options', l.grid(['attempts', 'created_at', 'started_at', 'completed_at'])], { key: 'definition', texts: 'Details' }),
            ],
            { key: 'job-sections' },
          ),
        ];
      },
    },
  },
});
