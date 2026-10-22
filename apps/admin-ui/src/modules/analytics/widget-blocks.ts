import { z } from 'zod';
import { MAX_PERIOD_DAYS, SERIES_BUCKETS } from '../../blocks/charts/period';
import { deliveriesBlock } from '../../blocks/deliveries/deliveries-block';
import { REPORT_PERIODS } from '../../blocks/delivery-report/delivery-report-query';
import { DEVICE_PROBLEMS_MAX, deviceHealthSummaryBlock } from '../../blocks/device-health-summary/device-health-summary-block';
import { FLOW_MAX_AREAS, flowMatrixBlock } from '../../blocks/flow-matrix/flow-matrix-block';
import { healthChartBlock } from '../../blocks/health-chart/health-chart-block';
import { HEATMAP_MAX_AREAS, HEATMAP_MAX_DAYS, HEATMAP_ROWS, heatmapBlock } from '../../blocks/heatmap/heatmap-block';
import { INCIDENT_LIST_MAX, INCIDENT_LIST_STATES, incidentsListBlock } from '../../blocks/incidents-list/incidents-list-block';
import { kpiFigures, kpisBlock } from '../../blocks/kpis/kpis-block';
import { occupancyNowBlock } from '../../blocks/occupancy-now/occupancy-now-block';
import { occupancySeriesBlock } from '../../blocks/occupancy-series/occupancy-series-block';
import { SEGMENT_TREND_MAX, segmentTrendBlock } from '../../blocks/segment-trend/segment-trend-block';
import { EVENT_SEVERITIES } from '../../enums/events';

/**
 * The widget contract's kinds and the root fields each may read (`itap.dashboard_widget_queries`,
 * migration `1792365700140_create_dashboards`), mirrored for the console: every entry of
 * `ANALYTIC_BLOCKS` reads one of these pairs, and every pair has an entry.
 */
export const DASHBOARD_WIDGET_QUERIES = {
  kpi: ['dashboard_kpis'],
  occupancy_series: ['occupancy_series', 'facility_occupancy_now'],
  flow_matrix: ['flow_matrix'],
  heatmap: ['area_hourly_stats', 'occupancy_series'],
  incidents_list: ['incidents'],
  segment_trend: ['segment_daily_stats'],
  device_health: ['devices', 'device_health_metrics'],
  deliveries: ['delivery_report'],
} as const;

export type DashboardWidgetKind = keyof typeof DASHBOARD_WIDGET_QUERIES;

/*
 * The analytic blocks a dashboard widget can render (Task 2 maps the widget contract's kinds onto
 * these entries). Each entry names its block, the GraphQL root field it reads (the contract's
 * `query`) and how a widget's `params` (snake_case JSON, free-form in the database) become the
 * block's props: unknown keys are refused, absent keys keep the block's defaults.
 */

const uuid = z.string().uuid();
const days = z.number().int().min(1).max(MAX_PERIOD_DAYS);
const count = (max: number) => z.number().int().min(1).max(max);

/** The keys that are set, so an absent param leaves the block's default in place. */
function defined<T extends Record<string, unknown>>(props: T): Partial<T> {
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined)) as Partial<T>;
}

/** Every analytic block by name: the block, the root field it reads and its params schema (params → props). */
export const ANALYTIC_BLOCKS = {
  kpis: {
    block: kpisBlock,
    query: 'dashboard_kpis',
    params: z
      .object({ figures: kpiFigures.optional(), details: z.boolean().optional() })
      .strict()
      .transform((p) => defined({ figures: p.figures, details: p.details })),
  },
  occupancySeries: {
    block: occupancySeriesBlock,
    query: 'occupancy_series',
    params: z
      .object({ facility_id: uuid.nullable().optional(), days: days.optional(), bucket: z.enum(SERIES_BUCKETS).optional() })
      .strict()
      .transform((p) => defined({ facilityId: p.facility_id, days: p.days, bucket: p.bucket })),
  },
  occupancyNow: {
    block: occupancyNowBlock,
    query: 'facility_occupancy_now',
    params: z
      .object({ facility_id: uuid.nullable().optional() })
      .strict()
      .transform((p) => defined({ facilityId: p.facility_id })),
  },
  flowMatrix: {
    block: flowMatrixBlock,
    query: 'flow_matrix',
    params: z
      .object({ facility_id: uuid.nullable().optional(), days: days.optional(), limit: z.number().int().min(2).max(FLOW_MAX_AREAS).optional() })
      .strict()
      .transform((p) => defined({ facilityId: p.facility_id, days: p.days, limit: p.limit })),
  },
  heatmap: {
    block: heatmapBlock,
    query: 'area_hourly_stats',
    params: z
      .object({
        facility_id: uuid.nullable().optional(),
        days: days.max(HEATMAP_MAX_DAYS).optional(),
        by: z.enum(HEATMAP_ROWS).optional(),
        limit: count(HEATMAP_MAX_AREAS).optional(),
      })
      .strict()
      .transform((p) => defined({ facilityId: p.facility_id, days: p.days, by: p.by, limit: p.limit })),
  },
  heatmapSeries: {
    // The facility's hourly occupancy series by weekday (the series has no areas).
    block: heatmapBlock,
    query: 'occupancy_series',
    params: z
      .object({ facility_id: uuid.nullable().optional(), days: days.max(HEATMAP_MAX_DAYS).optional() })
      .strict()
      .transform((p) => ({ ...defined({ facilityId: p.facility_id, days: p.days }), source: 'series' as const, by: 'weekday' as const })),
  },
  incidentsList: {
    block: incidentsListBlock,
    query: 'incidents',
    params: z
      .object({
        facility_id: uuid.nullable().optional(),
        status: z.enum(INCIDENT_LIST_STATES).optional(),
        min_severity: z.enum(EVENT_SEVERITIES).optional(),
        limit: count(INCIDENT_LIST_MAX).optional(),
      })
      .strict()
      .transform((p) => defined({ facilityId: p.facility_id, status: p.status, minSeverity: p.min_severity, limit: p.limit })),
  },
  segmentTrend: {
    block: segmentTrendBlock,
    query: 'segment_daily_stats',
    params: z
      .object({ segment_id: uuid.nullable().optional(), days: days.min(2).optional(), limit: count(SEGMENT_TREND_MAX).optional() })
      .strict()
      .transform((p) => defined({ segmentId: p.segment_id, days: p.days, limit: p.limit })),
  },
  deviceHealthSummary: {
    block: deviceHealthSummaryBlock,
    query: 'devices',
    params: z
      .object({ facility_id: uuid.nullable().optional(), limit: count(DEVICE_PROBLEMS_MAX).optional() })
      .strict()
      .transform((p) => defined({ facilityId: p.facility_id, limit: p.limit })),
  },
  deliveries: {
    block: deliveriesBlock,
    query: 'delivery_report',
    params: z
      .object({ period: z.enum(REPORT_PERIODS).optional() })
      .strict()
      .transform((p) => defined({ period: p.period })),
  },
  deviceHealthChart: {
    // One device's health over the last 24 hours (the device page's chart).
    block: healthChartBlock,
    query: 'device_health_metrics',
    params: z
      .object({ device_id: uuid.nullable().optional() })
      .strict()
      .transform((p) => defined({ deviceId: p.device_id })),
  },
} as const;

export type AnalyticBlockName = keyof typeof ANALYTIC_BLOCKS;

/** A widget's params read as one block's props, or the issues that refuse them (path and message each). */
export type AnalyticBlockProps =
  | { readonly ok: true; readonly props: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly issues: readonly { readonly path: string; readonly message: string }[] };

/** Reads a widget's `params` as the props of the named block (`ANALYTIC_BLOCKS[name].params`). */
export function analyticBlockProps(name: AnalyticBlockName, params: unknown): AnalyticBlockProps {
  const parsed = ANALYTIC_BLOCKS[name].params.safeParse(params ?? {});
  return parsed.success
    ? { ok: true, props: parsed.data }
    : { ok: false, issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) };
}
