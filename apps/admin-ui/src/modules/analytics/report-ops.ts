import { defineMutation, defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { REPORT_FACILITY_RESOURCE, REPORT_RESOURCE, REPORT_SEGMENT_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { MEMBER_NOT_ACTIVE_REFUSAL, type SqlRefusalText, sqlRefusals } from '../../data/sql-refusals';
import { REPORT_FORMATS } from '../../enums/incidents';
import { REPORT_TYPES } from '../../enums/reports';
import type { NewReport } from './report-shape';

/** The registry key the report operations are bound under. */
export const REPORTS_BINDING = 'reports';

const NOTHING = ' Nothing was created.';

/** What inserting a report (with its facilities and segments in the same statement) is refused with. */
export const CREATE_REPORT_REFUSALS = {
  reports_period:
    'The period is refused: the end date cannot be before the start date nor more than 366 days after it.' + NOTHING,
  reports_incident: 'An incident report needs its incident, and only an incident report names one.' + NOTHING,
  reports_title_not_blank: 'Give the report a title.' + NOTHING,
  reports_timezone_valid: 'The time zone is not one the database knows.' + NOTHING,
  reports_parameters_valid: 'The report’s parameters are refused.' + NOTHING,
  reports_incident_fkey: 'The incident no longer exists in this organization.' + NOTHING,
  report_facilities_facility_fkey: 'One of the facilities no longer exists.' + NOTHING,
  report_segments_segment_fkey: 'One of the segments no longer exists.' + NOTHING,
  report_template_type_mismatch: 'The template is of another report type.' + NOTHING,
  member_not_active: MEMBER_NOT_ACTIVE_REFUSAL,
} satisfies Record<string, SqlRefusalText>;

/** What `retry_report` raises. */
export const RETRY_REPORT_REFUSALS = {
  report_not_found: 'The report no longer exists in this organization. Nothing was changed.',
  report_not_failed:
    'The report is no longer failed (someone retried it, or retention expired it): reload it to see where it stands. Nothing was changed.',
} satisfies Record<string, SqlRefusalText>;

export const newReportSchema = z.object({
  reportType: z.enum(REPORT_TYPES),
  title: z.string().min(1),
  description: z.string().nullable(),
  format: z.enum(REPORT_FORMATS),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  incidentId: z.string().uuid().nullable(),
  timezone: z.string().nullable(),
  facilityIds: z.array(z.string().uuid()),
  segmentIds: z.array(z.string().uuid()),
});

export const createdReport = z.object({ id: z.string(), code: z.string() });

/** The insert object of one report with its targets nested, so they are in place before generation starts. */
export function reportInsertObject(report: NewReport): Record<string, unknown> {
  return {
    report_type: report.reportType,
    title: report.title,
    description: report.description,
    format: report.format,
    start_date: report.startDate,
    end_date: report.endDate,
    incident_id: report.incidentId,
    parameters: report.timezone === null ? {} : { timezone: report.timezone },
    report_facilities: { data: report.facilityIds.map((facility_id) => ({ facility_id })) },
    report_segments: { data: report.segmentIds.map((segment_id) => ({ segment_id })) },
  };
}

/**
 * Inserts a report with its facilities and segments in one statement: the targets are frozen once
 * generation starts (`report_targets_frozen`), and generation starts on the insert (`render_report`).
 */
export const createReportOperation = hasuraOperation(
  REPORTS_BINDING,
  'createReport',
  {
    kind: 'mutation',
    document: `mutation CreateReport($object: reports_insert_input!) {
  insert_reports_one(object: $object) { id code }
}`,
    variables: (input) => ({ object: reportInsertObject(input as NewReport) }),
    mapResult: (data) => rootOf(data, 'insert_reports_one') ?? null,
  },
  sqlRefusals(CREATE_REPORT_REFUSALS),
);

/** `retry_report(hasura_session, p_report)`: a failed report back to queued, generated again. */
export const retryReportOperation = hasuraOperation(
  REPORTS_BINDING,
  'retryReport',
  {
    kind: 'mutation',
    document: `mutation RetryReport($report: uuid!) {
  retry_report(args: { p_report: $report }) { id status }
}`,
    variables: (input) => ({ report: (input as { reportId: string }).reportId }),
    mapResult: (data) => {
      const rows = rootOf(data, 'retry_report');
      return Array.isArray(rows) ? (rows[0] ?? null) : null;
    },
  },
  sqlRefusals(RETRY_REPORT_REFUSALS),
);

/** A report's generation state, read by the status timeline while it is queued or generating. */
export const reportProgress = z.object({
  id: z.string(),
  status: z.string(),
  created_at: z.string(),
  generated_at: z.string().nullable(),
  updated_at: z.string(),
  attempts: z.number(),
  attempts_at_retry: z.number(),
  error: z.string().nullable(),
});

export type ReportProgress = z.infer<typeof reportProgress>;

export const reportProgressOperation = hasuraOperation(REPORTS_BINDING, 'reportProgress', {
  kind: 'query',
  document: `query ReportProgress($id: uuid!) {
  reports_by_pk(id: $id) { id status created_at generated_at updated_at attempts attempts_at_retry error }
}`,
  variables: (input) => ({ id: (input as { reportId: string }).reportId }),
  mapResult: (data) => {
    const row = reportProgress.safeParse(rootOf(data, 'reports_by_pk'));
    return row.success ? row.data : null;
  },
});

const REPORT_EFFECTS = [{ resource: REPORT_RESOURCE }];

/** "New report": the report and its targets, queued for generation. */
export const createReport = defineMutation('itap:create-report', {
  binding: createReportOperation.binding,
  input: schema(newReportSchema),
  output: schema(createdReport.nullable()),
  effects: [...REPORT_EFFECTS, { resource: REPORT_FACILITY_RESOURCE }, { resource: REPORT_SEGMENT_RESOURCE }],
});

/** "Retry" on a failed report. */
export const retryReport = defineMutation('itap:retry-report', {
  binding: retryReportOperation.binding,
  input: schema(z.object({ reportId: z.string().uuid() })),
  output: schema(z.object({ id: z.string(), status: z.string() }).nullable()),
  effects: REPORT_EFFECTS,
});

/** One report's generation state (`itap:report-status`). */
export const reportProgressQuery = defineQuery('itap:report-progress', {
  binding: reportProgressOperation.binding,
  input: schema(z.object({ reportId: z.string().uuid() })),
  output: schema(reportProgress.nullable()),
  reads: [resourceByName(REPORT_RESOURCE)],
});

export const REPORT_OPERATIONS = [createReportOperation, retryReportOperation, reportProgressOperation];
