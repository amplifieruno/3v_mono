import { MAX_PERIOD_DAYS, SERIES_BUCKETS } from '../blocks/charts/period';
import { REPORT_PERIODS } from '../blocks/delivery-report/delivery-report-query';
import { DEVICE_PROBLEMS_MAX } from '../blocks/device-health-summary/device-health-summary-block';
import { FLOW_MAX_AREAS } from '../blocks/flow-matrix/flow-matrix-block';
import { HEATMAP_MAX_AREAS, HEATMAP_MAX_DAYS, HEATMAP_ROWS } from '../blocks/heatmap/heatmap-block';
import { INCIDENT_LIST_MAX, INCIDENT_LIST_STATES } from '../blocks/incidents-list/incidents-list-block';
import { SEGMENT_TREND_MAX } from '../blocks/segment-trend/segment-trend-block';
import { DEVICE_RESOURCE, FACILITY_RESOURCE, SEGMENT_RESOURCE } from '../data/resource-names';
import { EVENT_SEVERITIES, EVENT_SEVERITY_ENUM } from '../enums/events';
import type { AnalyticBlockName } from '../modules/analytics/widget-blocks';

/**
 * The settings form of each widget source (`itap.dashboard-widgets`): which `params` keys it offers
 * and how each is entered. Every control can be left at "default", which removes the key so the
 * block's own default applies. The block's params schema (`widget-blocks.ts`) stays the judge.
 */
export type ParamControl =
  | { readonly key: string; readonly type: 'record'; readonly resource: string; readonly empty: 'sidebar' | 'every' | 'largest' | 'none' }
  | { readonly key: string; readonly type: 'number'; readonly min: number; readonly max: number }
  | {
      readonly key: string;
      readonly type: 'choice';
      readonly options: readonly string[];
      readonly enumName?: string;
      /** Keys the choice replaces: setting it removes them (the seed's `days` of a deliveries widget). */
      readonly replaces?: readonly string[];
    }
  | { readonly key: string; readonly type: 'boolean' }
  | { readonly key: 'figures'; readonly type: 'figures' };

const facility = (empty: 'sidebar' | 'every'): ParamControl => ({ key: 'facility_id', type: 'record', resource: FACILITY_RESOURCE, empty });
const days = (min: number, max: number): ParamControl => ({ key: 'days', type: 'number', min, max });
const limit = (min: number, max: number): ParamControl => ({ key: 'limit', type: 'number', min, max });

export const WIDGET_PARAMS: Readonly<Record<AnalyticBlockName, readonly ParamControl[]>> = {
  kpis: [{ key: 'figures', type: 'figures' }, { key: 'details', type: 'boolean' }],
  occupancySeries: [facility('sidebar'), days(1, MAX_PERIOD_DAYS), { key: 'bucket', type: 'choice', options: SERIES_BUCKETS }],
  occupancyNow: [facility('sidebar')],
  flowMatrix: [facility('sidebar'), days(1, MAX_PERIOD_DAYS), limit(2, FLOW_MAX_AREAS)],
  heatmap: [facility('sidebar'), days(1, HEATMAP_MAX_DAYS), { key: 'by', type: 'choice', options: HEATMAP_ROWS }, limit(1, HEATMAP_MAX_AREAS)],
  heatmapSeries: [facility('sidebar'), days(1, HEATMAP_MAX_DAYS)],
  incidentsList: [
    facility('every'),
    { key: 'status', type: 'choice', options: INCIDENT_LIST_STATES },
    { key: 'min_severity', type: 'choice', options: EVENT_SEVERITIES, enumName: EVENT_SEVERITY_ENUM },
    limit(1, INCIDENT_LIST_MAX),
  ],
  segmentTrend: [{ key: 'segment_id', type: 'record', resource: SEGMENT_RESOURCE, empty: 'largest' }, days(2, MAX_PERIOD_DAYS), limit(1, SEGMENT_TREND_MAX)],
  deviceHealthSummary: [facility('every'), limit(1, DEVICE_PROBLEMS_MAX)],
  deliveries: [{ key: 'period', type: 'choice', options: REPORT_PERIODS, replaces: ['days'] }],
  deviceHealthChart: [{ key: 'device_id', type: 'record', resource: DEVICE_RESOURCE, empty: 'none' }],
  deviceHealthDay: [facility('every')],
};

/** The stored params a source's form does not offer (kept as stored, listed under the form). */
export function otherParams(entry: AnalyticBlockName, params: Readonly<Record<string, unknown>>): string[] {
  const offered = new Set(WIDGET_PARAMS[entry].map((control) => control.key));
  return Object.keys(params).filter((key) => !offered.has(key));
}
