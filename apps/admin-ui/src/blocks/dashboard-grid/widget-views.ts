import type { BlockImplementation } from '@burojs/react';
import type { AnalyticBlockName } from '../../modules/analytics/widget-blocks';
import { deliveriesView } from '../deliveries/views';
import { deviceHealthDayView } from '../device-health-day/views';
import { deviceHealthSummaryView } from '../device-health-summary/views';
import { flowMatrixView } from '../flow-matrix/views';
import { healthChartView } from '../health-chart/views';
import { heatmapView } from '../heatmap/views';
import { incidentsListView } from '../incidents-list/views';
import { kpisView } from '../kpis/views';
import { occupancyNowView } from '../occupancy-now/views';
import { occupancySeriesView } from '../occupancy-series/views';
import { segmentTrendView } from '../segment-trend/views';

/**
 * The view of every analytic block a widget can render, by entry, as registered for
 * `<BuroProvider blockImplementations>`: the dashboard draws them itself because a view cannot read
 * the app's block catalogue nor place a block chosen from data (gap G60).
 */
export const WIDGET_VIEWS: Readonly<Record<AnalyticBlockName, BlockImplementation<unknown>>> = {
  kpis: kpisView,
  occupancySeries: occupancySeriesView,
  occupancyNow: occupancyNowView,
  flowMatrix: flowMatrixView,
  heatmap: heatmapView,
  heatmapSeries: heatmapView,
  incidentsList: incidentsListView,
  segmentTrend: segmentTrendView,
  deviceHealthSummary: deviceHealthSummaryView,
  deliveries: deliveriesView,
  deviceHealthChart: healthChartView,
  deviceHealthDay: deviceHealthDayView,
} as Readonly<Record<AnalyticBlockName, BlockImplementation<unknown>>>;
