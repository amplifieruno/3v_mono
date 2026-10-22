import { f } from '@burojs/field-types';
import {
  FACILITY_RESOURCE,
  INCIDENT_RESOURCE,
  REPORT_FACILITY_RESOURCE,
  REPORT_SCHEDULE_RESOURCE,
  REPORT_SEGMENT_RESOURCE,
  REPORT_TEMPLATE_RESOURCE,
  SEGMENT_RESOURCE,
  USER_RESOURCE,
} from '../../data/resource-names';
import { enumField } from '../../enums/field';
import { REPORT_FORMAT_ENUM, REPORT_FORMATS } from '../../enums/incidents';
import { REPORT_STATUS_ENUM, REPORT_STATUSES, REPORT_TYPE_ENUM, REPORT_TYPES } from '../../enums/reports';
import { dateTime } from '../../fields/date-time';
import { checkNotBlank } from '../../fields/not-blank';
import { reportParameters } from '../../fields/report-parameters';
import { storageFile } from '../../fields/storage-file';

const shown = ['list', 'show'] as const;
const showOnly = ['show'] as const;

/**
 * Columns of `itap.reports` the `org_admin` role reads. A report is history: what it covers (type,
 * period, incident, format, parameters, template) is fixed when it is requested, only its title and
 * description change later, and it is never deleted. Its generation (status, file, error, attempts) is
 * written by the platform. Its facilities and segments are links through `report_facilities` /
 * `report_segments`, inserted with the report (`./report-ops.ts`).
 */
export const reportFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  code: f.string({
    system: true,
    in: [...shown],
    texts: { label: 'Code', doc: { summary: 'The report’s number in the organization (REPORT-00012).' } },
  }),
  title: f.string({
    required: true,
    validate: checkNotBlank(),
    texts: { label: 'Title', doc: { summary: 'The report’s name in lists, notifications and the file’s heading.' } },
  }),
  description: f.text({ nullable: true, texts: { label: 'Description', doc: { summary: 'What the report is for, for whoever opens it.' } } }),
  report_type: enumField(REPORT_TYPES, REPORT_TYPE_ENUM, {
    required: true,
    write: 'create',
    texts: { label: 'Type', doc: { summary: 'What the report is about, which decides what it is made from.' } },
  }),
  status: enumField(REPORT_STATUSES, REPORT_STATUS_ENUM, {
    system: true,
    in: [...shown],
    texts: {
      label: 'Status',
      doc: {
        summary:
          'Where generation stands: queued, generating, completed (the file is ready), failed (with the error; Retry queues it again) or expired (the file was removed by retention).',
      },
    },
  }),
  format: enumField(REPORT_FORMATS, REPORT_FORMAT_ENUM, {
    required: true,
    write: 'create',
    default: 'pdf',
    texts: { label: 'Format', doc: { summary: 'The file the report is written as: PDF, Excel, CSV or JSON.' } },
  }),
  start_date: f.date({
    nullable: true,
    write: 'create',
    texts: { label: 'From', doc: { summary: 'The first day the report covers, in the report’s time zone.' } },
  }),
  end_date: f.date({
    nullable: true,
    write: 'create',
    texts: {
      label: 'To',
      doc: { summary: 'The last day the report covers (included): at most 366 days after the first.' },
    },
  }),
  incident_id: f.relation({
    to: INCIDENT_RESOURCE,
    nullable: true,
    write: 'create',
    open: 'page',
    providerOptions: { relationship: 'incident' },
    texts: { label: 'Incident', doc: { summary: 'The incident an incident report is about.' } },
  }),
  facilities: f.relationMany({
    to: FACILITY_RESOURCE,
    through: { resource: REPORT_FACILITY_RESOURCE, sourceKey: 'report_id', targetKey: 'facility_id' },
    preview: 'chips',
    open: 'page',
    texts: { label: 'Facilities', doc: { summary: 'The facilities the report covers; none means every facility.' } },
  }),
  segments: f.relationMany({
    to: SEGMENT_RESOURCE,
    through: { resource: REPORT_SEGMENT_RESOURCE, sourceKey: 'report_id', targetKey: 'segment_id' },
    preview: 'chips',
    open: 'page',
    texts: { label: 'Segments', doc: { summary: 'The segments a segment report covers; none means every segment.' } },
  }),
  parameters: reportParameters({
    editable: false,
    in: [...showOnly],
    texts: {
      label: 'Settings',
      doc: { summary: 'The time zone the report’s days and times are read in (else the organization’s) and, for a scheduled report, the period of its template.' },
    },
  }),
  template_id: f.relation({
    to: REPORT_TEMPLATE_RESOURCE,
    system: true,
    nullable: true,
    in: [...showOnly],
    open: 'page',
    providerOptions: { relationship: 'template' },
    texts: { label: 'Template', doc: { summary: 'The template a scheduled report was made from.' } },
  }),
  schedule_id: f.relation({
    to: REPORT_SCHEDULE_RESOURCE,
    system: true,
    nullable: true,
    in: [...shown],
    open: 'page',
    providerOptions: { relationship: 'schedule' },
    texts: { label: 'Schedule', doc: { summary: 'The schedule that made the report; empty for a report requested by hand.' } },
  }),
  file_id: storageFile({
    bucket: 'organization',
    kind: 'report',
    displayOnly: true,
    in: ['list', 'show'],
    texts: { label: 'File', doc: { summary: 'The generated file, opened through a short-lived link.' } },
  }),
  error: f.text({
    system: true,
    nullable: true,
    in: [...showOnly],
    texts: { label: 'Error', doc: { summary: 'Why the last generation failed (max_attempts: three attempts in a row failed).' } },
  }),
  attempts: f.number({
    system: true,
    in: [...showOnly],
    texts: { label: 'Attempts', doc: { summary: 'How many times generation was started, retries included.' } },
  }),
  generated_at: dateTime({
    system: true,
    in: [...shown],
    texts: { label: 'Generated', doc: { summary: 'When the file was written.' } },
  }),
  created_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    in: [...shown],
    open: 'none',
    texts: { label: 'Requested by', doc: { summary: 'Who requested the report; empty for a scheduled report.' } },
  }),
  requested_by_me: f.boolean({
    system: true,
    in: [],
    texts: { label: 'Mine', doc: { summary: 'Whether you requested the report.' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Requested', in: [...shown] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: [...showOnly] }),
};
