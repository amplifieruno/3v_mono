import { defineResource, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { reportStatusBlock } from '../../blocks/report-status/report-status-block';
import { resourceByName } from '../../data/resource-by-name';
import { NOTIFICATION_DELIVERY_RESOURCE, REPORT_RESOURCE } from '../../data/resource-names';
import { reportFields } from './report-fields';
import { newReportFlow, retryReportFlow } from './report-flows';

/** How often the reports list is read again, so queued reports are seen completing. */
export const REPORT_LIST_POLL_MS = 10_000;

/** The reports list's views. */
export const REPORT_SAVED_VIEWS = [
  { id: 'failed', texts: 'Failed', state: { filters: [{ field: 'status', op: 'eq', value: 'failed' }] } },
  { id: 'scheduled', texts: 'Scheduled', state: { filters: [{ field: 'schedule_id', op: 'nnull', value: true }] } },
  { id: 'incidents', texts: 'Incident reports', state: { filters: [{ field: 'report_type', op: 'eq', value: 'incident' }] } },
];

/**
 * Reports (`itap.reports`): files generated in the background from the stats, the audit log or an
 * incident, requested by hand ("New report"), by a schedule, or from an incident ("Generate incident
 * report"). The page follows generation step by step; a completed report opens its file, a failed one
 * shows its error and offers Retry. Reports are history: no delete, and only the title and
 * description change after the request.
 */
export const report = defineResource(REPORT_RESOURCE, {
  texts: {
    label: 'Report',
    labelPlural: 'Reports',
    doc: {
      summary:
        'A file (PDF, Excel, CSV or JSON) of figures for a period — occupancy, flows, busy hours, attendance, segments, compliance, device health, incidents — or of one incident, generated in the background.',
    },
  },
  basePath: '/reports',
  section: NAV_SECTIONS.analytics,
  order: 3,
  icon: NAV_ICONS.reports,
  displayField: 'title',
  data: { provider: 'hasura' },
  operations: { create: false, delete: false },
  builtinActions: { delete: false },
  fields: reportFields,
  actions: (r) => ({
    resource: [r.action.flow('new_report', newReportFlow)],
    item: [r.action.flow('retry', retryReportFlow)],
  }),
  views: {
    list: {
      columns: ['code', 'title', 'report_type', 'status', 'format', 'start_date', 'end_date', 'created_at', 'generated_at'],
      optionalColumns: ['schedule_id', 'created_by', 'incident_id'],
      defaultSort: [{ field: 'created_at', direction: 'desc' }],
      refetchInterval: REPORT_LIST_POLL_MS,
      search: { fields: ['code', { field: 'title', op: 'contains' }] },
      filters: {
        pinned: ['status', 'report_type'],
        fields: ['status', 'report_type', 'format', 'schedule_id', 'incident_id', 'created_by', 'created_at'],
      },
      savedViews: REPORT_SAVED_VIEWS,
    },
    show: {
      header: (l) => [l.grid(['code', 'report_type', 'status', 'format'])],
      body: (l) => {
        const status = l.ref('record', 'status');
        return [
          l.panel(['error'], {
            key: 'failed-notice',
            tone: 'destructive',
            texts: { title: 'Generation failed', description: 'Retry queues the report again with three new attempts.' },
            when: l.equals(status, 'failed'),
          }),
          l.panel(['file_id', 'generated_at'], {
            key: 'file',
            texts: { title: 'File', description: 'The generated file opens in a new tab through a short-lived link.' },
            when: l.equals(status, 'completed'),
          }),
          l.place(reportStatusBlock, { key: 'progress', props: { reportId: l.ref('record', 'id'), status } }),
          l.tabs(
            [
              l.panel(
                [
                  'title',
                  'description',
                  l.grid(['start_date', 'end_date', 'incident_id']),
                  'facilities',
                  'segments',
                  'parameters',
                  l.grid(['template_id', 'schedule_id']),
                  l.grid(['created_by', 'created_at', 'attempts', 'updated_at']),
                ],
                { key: 'details', texts: 'Details' },
              ),
              l.panel(
                [
                  l.place(relatedList(resourceByName(NOTIFICATION_DELIVERY_RESOURCE)), {
                    key: 'report-deliveries',
                    props: {
                      where: [{ field: 'report_id', op: 'eq', value: l.ref('record', 'id') }],
                      columns: ['created_at', 'recipient_user_id', 'recipient_address', 'channel', 'status'],
                      open: 'page',
                    },
                  }),
                ],
                { key: 'deliveries', texts: 'Deliveries' },
              ),
            ],
            { key: 'sections' },
          ),
        ];
      },
    },
    edit: { body: (l) => ['title', 'description', l.grid(['report_type', 'format']), l.grid(['start_date', 'end_date', 'incident_id'])] },
  },
});
