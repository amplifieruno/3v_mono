import { type Check, defineResource, relatedList } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import {
  RECIPIENT_GROUP_RESOURCE,
  REPORT_RESOURCE,
  REPORT_SCHEDULE_RESOURCE,
  REPORT_TEMPLATE_RESOURCE,
} from '../../data/resource-names';
import { enumField } from '../../enums/field';
import { REPORT_CHANNEL_ENUM, REPORT_CHANNELS } from '../../enums/reports';
import { cronField } from '../../fields/cron';
import { dateTime } from '../../fields/date-time';
import { checkNotBlank } from '../../fields/not-blank';
import { timezone } from '../../fields/timezone';

const runStamp = (label: string, summary: string) =>
  dateTime({ system: true, in: ['list', 'show'], texts: { label, doc: { summary } } });

/**
 * Columns of `itap.report_schedules` the `org_admin` role reads. The runs (`last_run_at`,
 * `next_run_at`, `last_error`, `last_failed_at`) are written by the `run_report_schedules` cron every
 * 15 minutes; changing the cron, the zone or switching it on or off clears the next run until then.
 */
export const reportScheduleFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  name: f.string({
    required: true,
    validate: checkNotBlank(),
    texts: { label: 'Name', doc: { summary: 'The schedule’s name; its reports are titled with it and their period.' } },
  }),
  template_id: f.relation({
    to: REPORT_TEMPLATE_RESOURCE,
    required: true,
    open: 'page',
    providerOptions: { relationship: 'template' },
    // `report_schedule_incident_template`: an incident report needs its incident, so it cannot run on a schedule.
    candidates: [{ field: 'report_type', op: 'ne', value: 'incident' }],
    texts: {
      label: 'Template',
      doc: { summary: 'The report each run makes, with its format and period. Incident report templates cannot be scheduled.' },
    },
  }),
  cron: cronField({
    required: true,
    texts: {
      label: 'When',
      doc: {
        summary:
          'When it runs, as a cron in the schedule’s time zone: minute hour day-of-month month weekday (0 or 7 = Sunday). Each run reports on the previous complete period of the template.',
      },
    },
  }),
  timezone: timezone({
    required: true,
    default: 'UTC',
    texts: { label: 'Time zone', doc: { summary: 'The zone the cron and the reported days are read in.' } },
  }),
  channel: enumField(REPORT_CHANNELS, REPORT_CHANNEL_ENUM, {
    required: true,
    default: 'email',
    texts: { label: 'Channel', doc: { summary: 'How the finished report reaches its recipients.' } },
  }),
  recipient_group_id: f.relation({
    to: RECIPIENT_GROUP_RESOURCE,
    nullable: true,
    open: 'page',
    providerOptions: { relationship: 'recipient_group' },
    texts: {
      label: 'Recipients',
      doc: { summary: 'The group whose members get each report on the channel; required unless the channel is webhook.' },
    },
  }),
  is_active: f.boolean({
    default: true,
    texts: { label: 'Active', doc: { summary: 'Whether it runs; switched off it keeps its settings and its reports.' } },
  }),
  next_run_at: runStamp('Next run', 'When it runs next; empty until the scheduler has planned it (within 15 minutes of a change).'),
  last_run_at: runStamp('Last run', 'When it last made a report.'),
  last_error: f.text({
    system: true,
    nullable: true,
    in: ['show'],
    texts: { label: 'Last error', doc: { summary: 'Why its last run failed; cleared by the next run that succeeds.' } },
  }),
  last_failed_at: dateTime({
    system: true,
    in: ['show'],
    texts: { label: 'Failed at', doc: { summary: 'When its last run failed.' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/** `report_schedules_recipients`: a group is needed unless the report goes to webhooks. */
export const REPORT_SCHEDULE_CHECKS: Check[] = [
  {
    id: 'reportScheduleRecipients',
    on: ['create', 'edit'],
    severity: 'error',
    // Said when saving, not while the empty form is being filled in.
    trigger: 'submit',
    anchor: 'recipient_group_id',
    texts: 'Choose the recipient group: only the webhook channel goes without one.',
    when: ({ values }) => values.channel !== 'webhook' && (values.recipient_group_id === null || values.recipient_group_id === undefined || values.recipient_group_id === ''),
  },
];

/**
 * Report schedules (`itap.report_schedules`): a template run on a cron in a time zone, its reports
 * delivered to a recipient group by email or in the app, or to webhook subscriptions. Switch one off
 * to pause it; deleting it keeps the reports it made.
 */
export const reportSchedule = defineResource(REPORT_SCHEDULE_RESOURCE, {
  texts: {
    label: 'Report schedule',
    labelPlural: 'Report schedules',
    doc: {
      summary:
        'Runs a report template regularly (a cron in a time zone) and delivers each report to a recipient group by email or in the app, or to webhooks.',
    },
  },
  basePath: '/report-schedules',
  section: NAV_SECTIONS.analytics,
  order: 5,
  icon: NAV_ICONS.reportSchedules,
  displayField: 'name',
  data: { provider: 'hasura' },
  fields: reportScheduleFields,
  checks: REPORT_SCHEDULE_CHECKS,
  views: {
    list: {
      columns: ['name', 'template_id', 'cron', 'channel', 'recipient_group_id', 'is_active', 'next_run_at', 'last_run_at'],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: [{ field: 'name', op: 'contains' }] },
      filters: { fields: ['is_active', 'channel', 'template_id', 'recipient_group_id'] },
      savedViews: [{ id: 'active', texts: 'Active', state: { filters: [{ field: 'is_active', op: 'eq', value: true }] } }],
    },
    show: {
      header: (l) => [l.grid(['name', 'template_id', 'is_active', 'next_run_at', 'last_run_at'])],
      body: (l) => [
        l.panel(['last_error', 'last_failed_at'], {
          key: 'last-failure',
          tone: 'destructive',
          texts: { title: 'Last run failed', description: 'The schedule moved on to its next run.' },
          when: l.present(l.ref('record', 'last_error')),
        }),
        l.grid(['cron', 'timezone']),
        l.grid(['channel', 'recipient_group_id']),
        l.panel(
          [
            l.place(relatedList(resourceByName(REPORT_RESOURCE)), {
              key: 'schedule-reports',
              props: {
                where: [{ field: 'schedule_id', op: 'eq', value: l.ref('record', 'id') }],
                columns: ['code', 'title', 'status', 'start_date', 'end_date', 'generated_at'],
                open: 'page',
              },
            }),
          ],
          { key: 'reports', texts: 'Reports' },
        ),
        l.grid(['created_at', 'updated_at']),
      ],
    },
    create: { body: (l) => ['name', 'template_id', l.grid(['cron', 'timezone']), l.grid(['channel', 'recipient_group_id']), 'is_active'] },
    edit: { body: (l) => ['name', 'template_id', l.grid(['cron', 'timezone']), l.grid(['channel', 'recipient_group_id']), 'is_active'] },
  },
});
