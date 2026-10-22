import { deliveriesBlock } from '../../blocks/deliveries/deliveries-block';
import { deviceHealthSummaryBlock } from '../../blocks/device-health-summary/device-health-summary-block';
import {
  deviceHealthSummary,
  deviceHealthSummaryOperation,
} from '../../blocks/device-health-summary/device-health-summary-query';
import { facilityZoneOperation, facilityZoneQuery } from '../../blocks/facility-period/facility-zone-query';
import { flowMatrixBlock } from '../../blocks/flow-matrix/flow-matrix-block';
import { flowMatrix, flowMatrixOperation } from '../../blocks/flow-matrix/flow-matrix-query';
import { heatmapBlock } from '../../blocks/heatmap/heatmap-block';
import { heatmapHours, heatmapOperation } from '../../blocks/heatmap/heatmap-query';
import { incidentsListBlock } from '../../blocks/incidents-list/incidents-list-block';
import { incidentsList, incidentsListOperation } from '../../blocks/incidents-list/incidents-list-query';
import { kpisBlock } from '../../blocks/kpis/kpis-block';
import { occupancySeriesBlock } from '../../blocks/occupancy-series/occupancy-series-block';
import { occupancySeries, occupancySeriesOperation } from '../../blocks/occupancy-series/occupancy-series-query';
import { segmentTrendBlock } from '../../blocks/segment-trend/segment-trend-block';
import { segmentTrend, segmentTrendOperation } from '../../blocks/segment-trend/segment-trend-query';
import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import {
  AREA_HOURLY_STAT_RESOURCE,
  AREA_TRANSITION_RESOURCE,
  FACILITY_DAILY_STAT_RESOURCE,
} from '../../data/resource-names';
import type { ConsoleModule } from '../module';
import { analyticsPage } from './analytics-page';
import { areaHourlyStat, areaHourlyStatFields } from './area-hourly-stat';
import { areaTransition, areaTransitionFields } from './area-transition';
import { facilityDailyStat, facilityDailyStatFields } from './facility-daily-stat';

/**
 * Analytics: the stats the hourly aggregation computes (hourly figures per area, daily figures per
 * facility, moves between areas; read only), the analytic blocks over the tracked query functions
 * and tables (occupancy over time, busy hours, flow matrix, key figures, incidents, segment trends,
 * device health, deliveries; `./widget-blocks.ts` lists them for dashboards) and the Analytics page
 * composing them for the sidebar facility and a period.
 */
export const analyticsModule = {
  name: 'analytics-module',
  uses: [
    areaHourlyStat,
    facilityDailyStat,
    areaTransition,
    analyticsPage,
    kpisBlock,
    occupancySeriesBlock,
    flowMatrixBlock,
    heatmapBlock,
    incidentsListBlock,
    segmentTrendBlock,
    deviceHealthSummaryBlock,
    deliveriesBlock,
    facilityZoneQuery,
    occupancySeries,
    flowMatrix,
    heatmapHours,
    incidentsList,
    segmentTrend,
    deviceHealthSummary,
  ],
  tables: {
    [AREA_HOURLY_STAT_RESOURCE]: hasuraTable('area_hourly_stats', {
      selectFields: selectFieldsOf(areaHourlyStatFields),
      orderByField: 'hour',
    }),
    [FACILITY_DAILY_STAT_RESOURCE]: hasuraTable('facility_daily_stats', {
      selectFields: selectFieldsOf(facilityDailyStatFields),
      orderByField: 'day',
    }),
    [AREA_TRANSITION_RESOURCE]: hasuraTable('area_transitions_daily', {
      selectFields: selectFieldsOf(areaTransitionFields),
      orderByField: 'day',
    }),
  },
  operations: [
    facilityZoneOperation,
    occupancySeriesOperation,
    flowMatrixOperation,
    heatmapOperation,
    incidentsListOperation,
    segmentTrendOperation,
    deviceHealthSummaryOperation,
  ],
} as const satisfies ConsoleModule;
