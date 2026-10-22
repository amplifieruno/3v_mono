import type { FieldTexts } from '@burojs/core';
import { type JsonFieldOpts, f } from '@burojs/field-types';
import { REPORT_PERIODS } from '../enums/reports';

/** The field implementation id of {@link reportParameters} (`./report-parameters-impl.ts`). */
export const REPORT_PARAMETERS_FIELD = 'itap.report-parameters';

export type ReportPeriod = (typeof REPORT_PERIODS)[number];

/** What a `parameters` object holds that the console reads (`itap.valid_report_parameters`). */
export interface ReportParameters {
  /** A template's period: what a scheduled run covers (default the previous day). */
  readonly period: ReportPeriod | null;
  /** The zone the report's dates and times are read in (default the organization's). */
  readonly timezone: string | null;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The period and zone of a stored `parameters` value; anything else is ignored. */
export function readReportParameters(value: unknown): ReportParameters {
  const row = isRecord(value) ? value : {};
  const period = REPORT_PERIODS.find((p) => p === row.period) ?? null;
  return { period, timezone: typeof row.timezone === 'string' && row.timezone !== '' ? row.timezone : null };
}

/** `value` with its period set (`null` removes the key: the previous day), every other key kept. */
export function withPeriod(value: unknown, period: ReportPeriod | null): Record<string, unknown> {
  const rest = Object.fromEntries(Object.entries(isRecord(value) ? value : {}).filter(([key]) => key !== 'period'));
  return period === null ? rest : { ...rest, period };
}

export interface ReportParametersOptions {
  readonly texts?: string | FieldTexts;
  /** Templates choose the period; on a report the parameters are shown only (insert-only). */
  readonly editable: boolean;
  readonly in?: JsonFieldOpts['in'];
}

/**
 * The `parameters` jsonb of a report or a template. A template's form chooses its period
 * (previous day, week or month: what each scheduled run covers); a report shows the period it was
 * made for and the zone its dates are read in. Keys the console does not know are kept as stored.
 */
export function reportParameters(opts: ReportParametersOptions) {
  const base = f.json({
    default: {},
    ...(opts.editable ? {} : { write: 'never' as const }),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
    ...(opts.in === undefined ? {} : { in: opts.in }),
  });
  return {
    ...base,
    ui: { ...base.ui, input: REPORT_PARAMETERS_FIELD, display: REPORT_PARAMETERS_FIELD },
    meta: {},
  };
}
