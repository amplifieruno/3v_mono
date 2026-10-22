import { type FlowConfig, type FlowUnknownCheck, type Layout, cond, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { FACILITY_RESOURCE, INCIDENT_RESOURCE, REPORT_RESOURCE, SEGMENT_RESOURCE } from '../../data/resource-names';
import { enumField } from '../../enums/field';
import { REPORT_FORMAT_ENUM, REPORT_FORMATS } from '../../enums/incidents';
import { REPORT_TYPE_ENUM, REPORT_TYPES } from '../../enums/reports';
import { checkNotBlank } from '../../fields/not-blank';
import { timezone } from '../../fields/timezone';
import { createReport, retryReport } from './report-ops';
import { type NewReport, newReportInput, reportPeriodProblem, typesWith } from './report-shape';

const newReportFields = {
  report_type: enumField(REPORT_TYPES, REPORT_TYPE_ENUM, {
    required: true,
    texts: { label: 'Type', doc: { summary: 'What the report is about; the form asks for what that type is made from.' } },
  }),
  title: f.string({
    required: true,
    validate: checkNotBlank(),
    texts: { label: 'Title', doc: { summary: 'The report’s name in lists, notifications and the file’s heading.' } },
  }),
  description: f.text({ nullable: true, texts: { label: 'Description', doc: { summary: 'What the report is for.' } } }),
  format: enumField(REPORT_FORMATS, REPORT_FORMAT_ENUM, {
    required: true,
    texts: { label: 'Format', doc: { summary: 'The file the report is written as.' } },
  }),
  start_date: f.date({
    required: true,
    texts: { label: 'From', doc: { summary: 'The first day the report covers, in the chosen time zone.' } },
  }),
  end_date: f.date({
    required: true,
    texts: { label: 'To', doc: { summary: 'The last day the report covers (included): at most 366 days after the first.' } },
  }),
  incident_id: f.relation({
    to: INCIDENT_RESOURCE,
    required: true,
    texts: { label: 'Incident', doc: { summary: 'The incident to report on, with its timeline, notes and events.' } },
  }),
  facility_ids: f.relationMany({
    to: FACILITY_RESOURCE,
    texts: { label: 'Facilities', doc: { summary: 'The facilities to cover; leave empty for every facility.' } },
  }),
  segment_ids: f.relationMany({
    to: SEGMENT_RESOURCE,
    texts: { label: 'Segments', doc: { summary: 'The segments to cover; leave empty for every segment.' } },
  }),
  timezone: timezone({
    texts: {
      label: 'Time zone',
      doc: { summary: 'The zone the days and times of the report are read in; empty uses the organization’s.' },
    },
  }),
};

type NewReportValues = Readonly<Record<string, unknown>>;

/** The period check of the form, refusing what `reports_period` refuses (Review Focus 3). */
const periodRefused =
  (code: string) =>
  ({ values }: { readonly values: NewReportValues }): boolean =>
    typesWith('period').some((type) => type === values.report_type) &&
    reportPeriodProblem(values.start_date, values.end_date)?.code === code;

/** What "New report" last sent, for "Check again" after a lost answer (a check sees no form values, G12). */
let lastSent: { readonly report: NewReport; readonly at: number } | null = null;

/** Applied when a report with the title sent was requested after the sending started. */
const reportCreated: FlowUnknownCheck = async ({ data }) => {
  const sent = lastSent;
  if (sent === null) return 'unknown';
  try {
    const { data: rows } = await data.list(resourceByName(REPORT_RESOURCE) as never, {
      filter: { field: 'title', op: 'eq', value: sent.report.title },
      sort: [{ field: 'created_at', direction: 'desc' }],
      pagination: { kind: 'offset', page: 1, pageSize: 1 },
    } as never);
    const latest = (rows as readonly Readonly<Record<string, unknown>>[])[0];
    const at = typeof latest?.created_at === 'string' ? Date.parse(latest.created_at) : Number.NaN;
    // A minute of clock difference between the browser and the database is allowed.
    return !Number.isNaN(at) && at >= sent.at - 60_000 ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};

/** The form: the type first, then only what that type is made from (`./report-shape.ts`). */
function newReportBody(l: Layout<typeof newReportFields>) {
  const type = l.ref('values', 'report_type');
  return [
    l.grid(['report_type', 'format']),
    'title',
    'description',
    l.grid([l.field('start_date', { when: l.in(type, typesWith('period')) }), l.field('end_date', { when: l.in(type, typesWith('period')) })]),
    l.field('incident_id', { when: l.in(type, typesWith('incident')) }),
    l.field('facility_ids', { when: l.in(type, typesWith('facilities')) }),
    l.field('segment_ids', { when: l.in(type, typesWith('segments')) }),
    'timezone',
  ] as const;
}

/**
 * "New report" on the reports list: the type, then the period (or the incident), the facilities or
 * segments it covers and the format; `createReport` inserts the report with its targets, generation
 * starts at once, and the new report's page opens to follow it. A period the database would refuse
 * (end before start, more than 366 days) is refused before anything is sent.
 */
export const newReportFlow = {
  texts: {
    label: 'New report',
    notify: 'Report {{code}} is queued; it is generated in the background.',
    doc: {
      summary:
        'Requests a report: occupancy, flows, busy hours, visit frequency, attendance, segment trends, compliance, device health, incidents, or one incident. It is generated in the background, usually within seconds.',
    },
  },
  icon: NAV_ICONS.newReport,
  surfaces: { list: 'regular' },
  form: {
    fields: newReportFields,
    initial: { format: { kind: 'literal', value: 'pdf' }, facility_ids: { kind: 'literal', value: [] }, segment_ids: { kind: 'literal', value: [] } },
    body: newReportBody,
  },
  checks: [
    {
      id: 'reportEndBeforeStart',
      severity: 'error',
      anchor: 'end_date',
      when: periodRefused('reportPeriod.endBeforeStart'),
      texts: 'The end date cannot be before the start date.',
    },
    {
      id: 'reportPeriodTooLong',
      severity: 'error',
      anchor: 'end_date',
      when: periodRefused('reportPeriod.tooLong'),
      texts: 'A report covers at most 367 days: the end date can be at most 366 days after the start date.',
    },
  ],
  submit: {
    mutation: createReport,
    retry: 'never',
    input: ({ values }) => {
      const report = newReportInput(values);
      lastSent = { report, at: Date.now() };
      return report;
    },
    onUnknown: { check: reportCreated },
  },
  then: { notify: { params: { code: ref('result', 'code') } }, open: { id: ref('result', 'id') } },
} satisfies FlowConfig<unknown, Record<never, never>, typeof newReportFields>;

/** Applied when the report is no longer failed (queued again, or already generating or done). */
const retried: FlowUnknownCheck = async ({ record, data }) => {
  const id = record?.id;
  if (typeof id !== 'string' || id === '') return 'unknown';
  try {
    const { data: row } = await data.one(resourceByName(REPORT_RESOURCE) as never, { id } as never);
    const status = (row as Readonly<Record<string, unknown>> | null | undefined)?.status;
    return typeof status !== 'string' ? 'unknown' : status === 'failed' ? 'not-applied' : 'applied';
  } catch {
    return 'unknown';
  }
};

/**
 * "Retry" on a failed report (`retry_report`): queued again with three fresh attempts and generated in
 * the background. Offered on failed reports only, the only status the database retries.
 */
export const retryReportFlow = {
  texts: {
    label: 'Retry',
    confirm: 'Generate this report again? It is queued and generated in the background.',
    notify: 'The report is queued again.',
    doc: { summary: 'Queues a failed report again: it gets three new attempts and the error is cleared.' },
  },
  icon: NAV_ICONS.retryReport,
  surfaces: { default: 'menu', show: 'auto', row: 'menu' },
  when: cond.equals(ref('record', 'status'), 'failed'),
  confirm: true,
  submit: { mutation: retryReport, retry: 'never', input: { reportId: ref('record', 'id') }, onUnknown: { check: retried } },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;
