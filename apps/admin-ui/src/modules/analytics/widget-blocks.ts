import { z } from 'zod';
import { MAX_PERIOD_DAYS, SERIES_BUCKETS } from '../../blocks/charts/period';
import { deliveriesBlock } from '../../blocks/deliveries/deliveries-block';
import { deviceHealthDayBlock } from '../../blocks/device-health-day/device-health-day-block';
import { REPORT_PERIODS } from '../../blocks/delivery-report/delivery-report-query';
import { DEVICE_PROBLEMS_MAX, deviceHealthSummaryBlock } from '../../blocks/device-health-summary/device-health-summary-block';
import { FLOW_MAX_AREAS, flowMatrixBlock } from '../../blocks/flow-matrix/flow-matrix-block';
import { healthChartBlock } from '../../blocks/health-chart/health-chart-block';
import { HEATMAP_MAX_AREAS, HEATMAP_MAX_DAYS, HEATMAP_ROWS, heatmapBlock } from '../../blocks/heatmap/heatmap-block';
import { INCIDENT_LIST_MAX, incidentListStatus, incidentsListBlock } from '../../blocks/incidents-list/incidents-list-block';
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
 * The analytic blocks a dashboard widget can render. Each entry names the widget kind it serves, its
 * block, the GraphQL root field it reads (the contract's `query`), whether the block needs a facility
 * (`required`: a widget without `facility_id` shows the sidebar facility; `all`: none = every
 * facility; `none`: no facility) and how a widget's `params` (snake_case JSON, free-form in the
 * database) become the block's props: unknown keys are refused, absent keys keep the block's defaults.
 * A kind and query served by two entries are told apart by `when` (`./dashboard-contract.ts`).
 */

const uuid = z.string().uuid();
const days = z.number().int().min(1).max(MAX_PERIOD_DAYS);
const count = (max: number) => z.number().int().min(1).max(max);
/** The seed writes `hours: 24` on device health widgets: the only window the health reads have. */
const hours = z.literal(24);

/** A delivery report period by its days (the seed writes `days: 7`). */
const DELIVERY_DAYS = { 1: '24h', 7: '7d', 30: '30d' } as const;
const deliveryDays = z.union([z.literal(1), z.literal(7), z.literal(30)]);

/** How a widget's facility is read: needed, `null` = every facility, or not at all. */
export type WidgetFacility = 'required' | 'all' | 'none';

const has = (key: string) => (params: Readonly<Record<string, unknown>>) => Object.hasOwn(params, key);

/** The keys that are set, so an absent param leaves the block's default in place. */
function defined<T extends Record<string, unknown>>(props: T): Partial<T> {
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined)) as Partial<T>;
}

/** One analytic block a widget can render (see the comment above). */
export interface AnalyticBlockEntry {
  readonly kind: DashboardWidgetKind;
  readonly facility: WidgetFacility;
  /** For a kind and query two entries serve: whether this one renders the widget's params. */
  readonly when?: (params: Readonly<Record<string, unknown>>) => boolean;
  readonly block: { readonly kind: 'block'; readonly ref: { readonly namespace: string; readonly id: string } };
  readonly query: string;
  readonly params: z.ZodType<Readonly<Record<string, unknown>>, z.ZodTypeDef, unknown>;
}

/** Every analytic block by name: its kind, block, the root field it reads and its params schema (params → props). */
export const ANALYTIC_BLOCKS = {
  kpis: {
    kind: 'kpi',
    facility: 'none',
    block: kpisBlock,
    query: 'dashboard_kpis',
    params: z
      .object({ figures: kpiFigures.optional(), details: z.boolean().optional() })
      .strict()
      .transform((p) => defined({ figures: p.figures, details: p.details })),
  },
  occupancySeries: {
    kind: 'occupancy_series',
    facility: 'required',
    block: occupancySeriesBlock,
    query: 'occupancy_series',
    params: z
      .object({ facility_id: uuid.nullable().optional(), days: days.optional(), bucket: z.enum(SERIES_BUCKETS).optional() })
      .strict()
      .transform((p) => defined({ facilityId: p.facility_id, days: p.days, bucket: p.bucket })),
  },
  occupancyNow: {
    kind: 'occupancy_series',
    facility: 'required',
    block: occupancyNowBlock,
    query: 'facility_occupancy_now',
    params: z
      .object({ facility_id: uuid.nullable().optional() })
      .strict()
      .transform((p) => defined({ facilityId: p.facility_id })),
  },
  flowMatrix: {
    kind: 'flow_matrix',
    facility: 'required',
    block: flowMatrixBlock,
    query: 'flow_matrix',
    params: z
      .object({ facility_id: uuid.nullable().optional(), days: days.optional(), limit: z.number().int().min(2).max(FLOW_MAX_AREAS).optional() })
      .strict()
      .transform((p) => defined({ facilityId: p.facility_id, days: p.days, limit: p.limit })),
  },
  heatmap: {
    kind: 'heatmap',
    facility: 'required',
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
    kind: 'heatmap',
    facility: 'required',
    block: heatmapBlock,
    query: 'occupancy_series',
    params: z
      .object({ facility_id: uuid.nullable().optional(), days: days.max(HEATMAP_MAX_DAYS).optional() })
      .strict()
      .transform((p) => ({ ...defined({ facilityId: p.facility_id, days: p.days }), source: 'series' as const, by: 'weekday' as const })),
  },
  incidentsList: {
    kind: 'incidents_list',
    facility: 'all',
    block: incidentsListBlock,
    query: 'incidents',
    params: z
      .object({
        facility_id: uuid.nullable().optional(),
        status: incidentListStatus.optional(),
        min_severity: z.enum(EVENT_SEVERITIES).optional(),
        limit: count(INCIDENT_LIST_MAX).optional(),
      })
      .strict()
      .transform((p) => defined({ facilityId: p.facility_id, status: p.status, minSeverity: p.min_severity, limit: p.limit })),
  },
  segmentTrend: {
    kind: 'segment_trend',
    facility: 'none',
    block: segmentTrendBlock,
    query: 'segment_daily_stats',
    params: z
      .object({ segment_id: uuid.nullable().optional(), days: days.min(2).optional(), limit: count(SEGMENT_TREND_MAX).optional() })
      .strict()
      .transform((p) => defined({ segmentId: p.segment_id, days: p.days, limit: p.limit })),
  },
  deviceHealthSummary: {
    kind: 'device_health',
    facility: 'all',
    block: deviceHealthSummaryBlock,
    query: 'devices',
    params: z
      .object({ facility_id: uuid.nullable().optional(), limit: count(DEVICE_PROBLEMS_MAX).optional() })
      .strict()
      .transform((p) => defined({ facilityId: p.facility_id, limit: p.limit })),
  },
  deliveries: {
    kind: 'deliveries',
    facility: 'none',
    block: deliveriesBlock,
    query: 'delivery_report',
    params: z
      .object({ period: z.enum(REPORT_PERIODS).optional(), days: deliveryDays.optional() })
      .strict()
      .refine((p) => p.period === undefined || p.days === undefined, { message: 'Give the period or its days, not both.' })
      .transform((p) => defined({ period: p.days === undefined ? p.period : DELIVERY_DAYS[p.days] })),
  },
  deviceHealthChart: {
    // One device's health over the last 24 hours (the device page's chart): the widget names `device_id`.
    kind: 'device_health',
    facility: 'none',
    when: has('device_id'),
    block: healthChartBlock,
    query: 'device_health_metrics',
    params: z
      .object({ device_id: uuid.nullable(), hours: hours.optional() })
      .strict()
      .transform((p) => ({ deviceId: p.device_id })),
  },
  deviceHealthDay: {
    // Every device's checks over the last 24 hours, one row each (a widget naming no device).
    kind: 'device_health',
    facility: 'all',
    block: deviceHealthDayBlock,
    query: 'device_health_metrics',
    params: z
      .object({ facility_id: uuid.nullable().optional(), hours: hours.optional() })
      .strict()
      .transform((p) => defined({ facilityId: p.facility_id })),
  },
} as const satisfies Readonly<Record<string, AnalyticBlockEntry>>;

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
