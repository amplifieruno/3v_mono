import { type FlowConfig, type FlowUnknownCheck, type Rule, defineResource, ref, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { EXPORT_DEFINITION_RESOURCE, EXPORT_JOB_RESOURCE } from '../../data/resource-names';
import { exportDefinitionFields } from './export-definition-fields';
import { EXPORT_JOB_COLUMNS, ownedByOther } from './export-job';
import { runExport } from './export-ops';

type Row = Readonly<Record<string, unknown>>;

/** Why another member's definition cannot be changed or run (the database refuses the same). */
export const NOT_OWNER_REASON = 'Only its owner can change, delete or run an export definition: its jobs read the data with the owner’s permissions.';

/** Only the owner edits, deletes or runs a definition (update / delete permissions, `export_owner_only`). */
export const EXPORT_DEFINITION_RULES: Rule[] = [
  {
    target: { kind: 'action', name: ['edit', 'delete', 'run_now'] },
    deny: 'run',
    when: (ctx) => ownedByOther(ctx, 'owner_id'),
    fallback: 'disable',
    reason: NOT_OWNER_REASON,
  },
];

/** Check again after a lost "Run now": a manual job of the definition requested in the last two minutes. */
export const exportStarted: FlowUnknownCheck = async ({ record, data }) => {
  const id = (record as Row | null | undefined)?.id;
  if (typeof id !== 'string' || id === '') return 'unknown';
  try {
    const { data: rows } = await data.list(
      resourceByName(EXPORT_JOB_RESOURCE) as never,
      {
        filter: {
          and: [
            { field: 'definition_id', op: 'eq', value: id },
            { field: 'trigger', op: 'eq', value: 'manual' },
            { field: 'created_at', op: 'gte', value: new Date(Date.now() - 120_000).toISOString() },
          ],
        },
        pagination: { kind: 'offset', page: 1, pageSize: 1 },
      } as never,
    );
    return (rows as readonly unknown[]).length > 0 ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};

/** "Run now": a job of the definition now, as its owner; opens the job, which follows it to its file. */
export const runExportFlow = {
  texts: {
    label: 'Run now',
    notify: 'The export started; its job shows the file when it is ready.',
    doc: { summary: 'Starts a job of the definition now, outside its schedule, and opens it. The file is yours only.' },
  },
  icon: NAV_ICONS.runExport,
  surfaces: { default: 'menu', show: 'auto', row: 'menu' },
  submit: {
    mutation: runExport,
    retry: 'never',
    input: { definitionId: ref('record', 'id') },
    onUnknown: { check: exportStarted },
  },
  then: { notify: true, open: { resource: EXPORT_JOB_RESOURCE, id: ref('result', 'id') } },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

const FORM = ['name', 'description', 'entity', 'format', 'filters', 'mode', 'max_rows', 'schedule_cron', 'timezone', 'is_active'] as const;

/**
 * Export definitions (`itap.export_definitions`): what to export (data, filters), how (format, full
 * or incremental, rows per file) and when (schedule), owned by the member who created it. Run now
 * and the schedule start jobs (Jobs tab) whose files only the owner can open.
 */
export const exportDefinition = defineResource(EXPORT_DEFINITION_RESOURCE, {
  texts: {
    label: 'Export definition',
    labelPlural: 'Export definitions',
    doc: {
      summary:
        'A saved export of the organization’s data to a CSV, JSON or Excel file, by hand or on a schedule; owned by its creator, the only member who runs it and opens its files.',
    },
  },
  basePath: '/export-definitions',
  section: NAV_SECTIONS.compliance,
  order: 75,
  icon: NAV_ICONS.exportDefinitions,
  displayField: 'name',
  data: { provider: 'hasura' },
  fields: exportDefinitionFields,
  rules: EXPORT_DEFINITION_RULES,
  actions: (r) => ({ item: [r.action.flow('run_now', runExportFlow)] }),
  views: {
    list: {
      columns: ['code', 'name', 'entity', 'format', 'mode', 'schedule_cron', 'owner_id', 'next_run_at', 'is_active'],
      defaultSort: [{ field: 'code', direction: 'asc' }],
      search: { fields: [{ field: 'name', op: 'contains' }, 'code'] },
      filters: { pinned: ['entity', 'owner_id'], fields: ['entity', 'format', 'mode', 'is_active', 'owner_id'] },
      savedViews: [{ id: 'scheduled', texts: 'Scheduled', state: { filters: [{ field: 'schedule_cron', op: 'nnull', value: true }] } }],
    },
    show: {
      header: (l) => [l.grid(['code', 'entity', 'format', 'owner_id'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(
              [
                'name',
                'description',
                l.grid(['mode', 'max_rows', 'watermark']),
                'filters',
                l.panel([l.grid(['schedule_cron', 'timezone', 'is_active']), l.grid(['next_run_at', 'last_run_at', 'last_error'])], {
                  key: 'schedule',
                  texts: { title: 'Schedule' },
                }),
                l.grid(['created_at', 'updated_at']),
              ],
              { key: 'details', texts: 'Details' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(EXPORT_JOB_RESOURCE)), {
                  key: 'export-definition-jobs',
                  props: { where: [{ field: 'definition_id', op: 'eq', value: l.ref('record', 'id') }], columns: [...EXPORT_JOB_COLUMNS], open: 'page' },
                }),
              ],
              { key: 'jobs', texts: 'Jobs' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
    create: { body: () => [...FORM] },
    edit: { body: () => [...FORM] },
  },
});
