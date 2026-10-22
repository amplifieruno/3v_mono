import { problemIssue, type FieldProblem } from '../../fields/field-issue';
import { REPORT_TYPES, type ReportType } from '../../enums/reports';

/**
 * What each report type is made from (design §6.10, `itap.compute_report`): a period, or one incident;
 * the facilities it covers (none = every facility) or the segments (none = every segment). Every type
 * but `incident` needs a period (`reports_period`); `behavior` is a snapshot of the last 30 days and
 * `compliance` is organization-wide, so neither takes targets.
 */
export interface ReportTypeShape {
  readonly period: boolean;
  readonly incident: boolean;
  readonly facilities: boolean;
  readonly segments: boolean;
}

const PERIOD = { period: true, incident: false, facilities: false, segments: false } as const;
const FACILITIES = { ...PERIOD, facilities: true } as const;

export const REPORT_TYPE_SHAPES = {
  occupancy: FACILITIES,
  flow: FACILITIES,
  heatmap: FACILITIES,
  behavior: PERIOD,
  attendance: FACILITIES,
  segment: { ...PERIOD, segments: true },
  compliance: PERIOD,
  device_health: FACILITIES,
  incident_summary: FACILITIES,
  incident: { period: false, incident: true, facilities: false, segments: false },
} as const satisfies Record<ReportType, ReportTypeShape>;

/** The report types whose form shows `part`. */
export const typesWith = (part: keyof ReportTypeShape): ReportType[] =>
  REPORT_TYPES.filter((type) => REPORT_TYPE_SHAPES[type][part]);

/** The longest period, in days between start and end (`reports_period`: `end_date - start_date <= 366`). */
export const MAX_REPORT_SPAN_DAYS = 366;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** A `YYYY-MM-DD` date as days since the epoch, or `null`. */
function epochDay(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = DATE.exec(value);
  if (match === null) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(ms) ? null : Math.round(ms / 86_400_000);
}

/**
 * Why a report period is refused, exactly as `reports_period` refuses it: the end before the start,
 * or the end more than 366 days after the start (a period of at most 367 days, both ends included).
 * `null` when the period is accepted or not complete yet (the `required` rule's concern).
 */
export function reportPeriodProblem(start: unknown, end: unknown): FieldProblem | null {
  const from = epochDay(start);
  const to = epochDay(end);
  if (from === null || to === null) return null;
  if (to < from) return { code: 'reportPeriod.endBeforeStart', text: 'The end date cannot be before the start date.' };
  const days = to - from;
  if (days > MAX_REPORT_SPAN_DAYS) {
    return {
      code: 'reportPeriod.tooLong',
      text: `A report covers at most 367 days: the end date can be at most 366 days after the start date (it is ${days} days after).`,
      params: { days },
    };
  }
  return null;
}

/** {@link reportPeriodProblem} as the translatable issue of a check. */
export const reportPeriodIssue = (start: unknown, end: unknown) => {
  const problem = reportPeriodProblem(start, end);
  return problem === null ? null : problemIssue(problem);
};

/** What "New report" sends (`createReport`), already narrowed to the chosen type. */
export interface NewReport {
  readonly reportType: ReportType;
  readonly title: string;
  readonly description: string | null;
  readonly format: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly incidentId: string | null;
  readonly timezone: string | null;
  readonly facilityIds: readonly string[];
  readonly segmentIds: readonly string[];
}

const text = (value: unknown): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed === '' ? null : trimmed;
};
const ids = (value: unknown): string[] => (Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string'))] : []);

/**
 * The form's values as the report to insert: only the parts the chosen type uses are kept (a period
 * typed before switching to an incident report is not sent, nor facilities for a segment report).
 */
export function newReportInput(values: Readonly<Record<string, unknown>>): NewReport {
  const reportType = REPORT_TYPES.find((type) => type === values.report_type) ?? 'occupancy';
  const shape: ReportTypeShape = REPORT_TYPE_SHAPES[reportType];
  return {
    reportType,
    title: text(values.title) ?? '',
    description: text(values.description),
    format: text(values.format) ?? 'pdf',
    startDate: shape.period ? text(values.start_date) : null,
    endDate: shape.period ? text(values.end_date) : null,
    incidentId: shape.incident ? text(values.incident_id) : null,
    timezone: text(values.timezone),
    facilityIds: shape.facilities ? ids(values.facility_ids) : [],
    segmentIds: shape.segments ? ids(values.segment_ids) : [],
  };
}
