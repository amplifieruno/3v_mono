import { dashboardGridView } from '../../blocks/dashboard-grid/views';
import { deliveriesView } from '../../blocks/deliveries/views';
import { deviceHealthDayView } from '../../blocks/device-health-day/views';
import { deviceHealthSummaryView } from '../../blocks/device-health-summary/views';
import { flowMatrixView } from '../../blocks/flow-matrix/views';
import { heatmapView } from '../../blocks/heatmap/views';
import { incidentsListView } from '../../blocks/incidents-list/views';
import { kpisView } from '../../blocks/kpis/views';
import { occupancySeriesView } from '../../blocks/occupancy-series/views';
import { reportStatusView } from '../../blocks/report-status/views';
import { segmentTrendView } from '../../blocks/segment-trend/views';

/** The views of the analytics module's blocks (kept apart from `./index.ts`, which stays React-free). */
export const analyticsViews = [
  kpisView,
  occupancySeriesView,
  flowMatrixView,
  heatmapView,
  incidentsListView,
  segmentTrendView,
  deviceHealthSummaryView,
  deliveriesView,
  deviceHealthDayView,
  dashboardGridView,
  reportStatusView,
] as const;
