import { type Rule, defineResource, relatedList } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { REPORT_RESOURCE, REPORT_SCHEDULE_RESOURCE, REPORT_TEMPLATE_RESOURCE } from '../../data/resource-names';
import { enumField } from '../../enums/field';
import { REPORT_FORMAT_ENUM, REPORT_FORMATS } from '../../enums/incidents';
import { REPORT_TYPE_ENUM, REPORT_TYPES } from '../../enums/reports';
import { checkNotBlank } from '../../fields/not-blank';
import { reportParameters } from '../../fields/report-parameters';

/**
 * Columns of `itap.report_templates` the `org_admin` role reads. The type is fixed once created (the
 * schedules using a template depend on it); the built-in templates (`is_system`) are read only.
 */
export const reportTemplateFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  name: f.string({
    required: true,
    validate: checkNotBlank(),
    texts: { label: 'Name', doc: { summary: 'The template’s name, unique in the organization.' } },
  }),
  description: f.text({ nullable: true, texts: { label: 'Description', doc: { summary: 'What reports made from it show.' } } }),
  report_type: enumField(REPORT_TYPES, REPORT_TYPE_ENUM, {
    required: true,
    write: 'create',
    texts: { label: 'Type', doc: { summary: 'What its reports are about; fixed once the template exists, since schedules depend on it.' } },
  }),
  format: enumField(REPORT_FORMATS, REPORT_FORMAT_ENUM, {
    required: true,
    default: 'pdf',
    texts: { label: 'Format', doc: { summary: 'The file its reports are written as.' } },
  }),
  parameters: reportParameters({
    editable: true,
    texts: {
      label: 'Period',
      doc: {
        summary:
          'What each scheduled run covers: the previous complete day, week (Monday to Sunday) or month before the run, in the schedule’s time zone.',
      },
    },
  }),
  is_system: f.boolean({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Built in', doc: { summary: 'A template that comes with the platform: it can be used and scheduled, not changed or deleted.' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/** Why a built-in template cannot be changed (beside every disabled action and field). */
export const BUILT_IN_TEMPLATE_REASON = 'A built-in template is read only: create your own template to change the format or period.';

const builtIn = (record: unknown): boolean => (record as Readonly<Record<string, unknown>> | null | undefined)?.is_system === true;

/** Built-in templates are read only (the database's permissions refuse the same). */
export const REPORT_TEMPLATE_RULES: Rule[] = [
  {
    target: { kind: 'action', name: ['edit', 'delete'] },
    deny: 'run',
    when: (ctx) => builtIn(ctx.record),
    fallback: 'disable',
    reason: BUILT_IN_TEMPLATE_REASON,
  },
  {
    target: { kind: 'field' },
    deny: 'edit',
    when: (ctx) => builtIn(ctx.record),
    fallback: 'disable',
    reason: BUILT_IN_TEMPLATE_REASON,
  },
];

/**
 * Report templates (`itap.report_templates`): a report type with its format and period, what report
 * schedules run. The organization's own templates can be changed and deleted (a template a schedule
 * still uses cannot be deleted); the built-in ones are read only.
 */
export const reportTemplate = defineResource(REPORT_TEMPLATE_RESOURCE, {
  texts: {
    label: 'Report template',
    labelPlural: 'Report templates',
    doc: {
      summary:
        'A report type with its file format and the period a scheduled run covers (previous day, week or month). Schedules run templates.',
    },
  },
  basePath: '/report-templates',
  section: NAV_SECTIONS.analytics,
  order: 4,
  icon: NAV_ICONS.reportTemplates,
  displayField: 'name',
  data: { provider: 'hasura' },
  fields: reportTemplateFields,
  rules: REPORT_TEMPLATE_RULES,
  views: {
    list: {
      columns: ['name', 'report_type', 'format', 'parameters', 'is_system'],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: [{ field: 'name', op: 'contains' }] },
      filters: { fields: ['report_type', 'format', 'is_system'] },
      savedViews: [
        { id: 'built-in', texts: 'Built in', state: { filters: [{ field: 'is_system', op: 'eq', value: true }] } },
        { id: 'own', texts: 'Our own', state: { filters: [{ field: 'is_system', op: 'eq', value: false }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['name', 'report_type', 'format', 'parameters', 'is_system'])],
      body: (l) => {
        const byTemplate = [{ field: 'template_id', op: 'eq', value: l.ref('record', 'id') }] as const;
        return [
          'description',
          l.tabs(
            [
              l.panel(
                [
                  l.place(relatedList(resourceByName(REPORT_SCHEDULE_RESOURCE)), {
                    key: 'template-schedules',
                    props: { where: [...byTemplate], columns: ['name', 'cron', 'channel', 'is_active', 'next_run_at'], open: 'page' },
                  }),
                ],
                { key: 'schedules', texts: 'Schedules' },
              ),
              l.panel(
                [
                  l.place(relatedList(resourceByName(REPORT_RESOURCE)), {
                    key: 'template-reports',
                    props: { where: [...byTemplate], columns: ['code', 'title', 'status', 'created_at'], open: 'page' },
                  }),
                ],
                { key: 'reports', texts: 'Reports' },
              ),
            ],
            { key: 'sections' },
          ),
          l.grid(['created_at', 'updated_at']),
        ];
      },
    },
    create: { body: (l) => [l.grid(['name', 'report_type']), l.grid(['format', 'parameters']), 'description'] },
    edit: { body: (l) => [l.grid(['name', 'report_type']), l.grid(['format', 'parameters']), 'description'] },
  },
});
