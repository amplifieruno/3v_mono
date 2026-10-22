import { dashboardGridBlock } from '../../blocks/dashboard-grid/dashboard-grid-block';
import { readableFieldsOperation, readableRootFields } from '../../blocks/dashboard-grid/readable-fields-query';
import { deliveriesBlock } from '../../blocks/deliveries/deliveries-block';
import { deviceHealthDayBlock } from '../../blocks/device-health-day/device-health-day-block';
import { deviceHealthDay, deviceHealthDayOperation } from '../../blocks/device-health-day/device-health-day-query';
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
import { reportStatusBlock } from '../../blocks/report-status/report-status-block';
import { segmentTrendBlock } from '../../blocks/segment-trend/segment-trend-block';
import { segmentTrend, segmentTrendOperation } from '../../blocks/segment-trend/segment-trend-query';
import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import {
  AREA_HOURLY_STAT_RESOURCE,
  AREA_TRANSITION_RESOURCE,
  DASHBOARD_RESOURCE,
  FACILITY_DAILY_STAT_RESOURCE,
  REPORT_FACILITY_RESOURCE,
  REPORT_RESOURCE,
  REPORT_SCHEDULE_RESOURCE,
  REPORT_SEGMENT_RESOURCE,
  REPORT_TEMPLATE_RESOURCE,
} from '../../data/resource-names';
import type { ConsoleModule } from '../module';
import { analyticsPage } from './analytics-page';
import { areaHourlyStat, areaHourlyStatFields } from './area-hourly-stat';
import { areaTransition, areaTransitionFields } from './area-transition';
import { dashboard } from './dashboard';
import { dashboardFields } from './dashboard-fields';
import { facilityDailyStat, facilityDailyStatFields } from './facility-daily-stat';
import { report } from './report';
import { reportFields } from './report-fields';
import { REPORT_OPERATIONS, createReport, reportProgressQuery, retryReport } from './report-ops';
import { reportSchedule, reportScheduleFields } from './report-schedule';
import { reportFacility, reportFacilityFields, reportSegment, reportSegmentFields } from './report-targets';
import { reportTemplate, reportTemplateFields } from './report-template';

/**
 * Analytics: the stats the hourly aggregation computes (hourly figures per area, daily figures per
 * facility, moves between areas; read only), the analytic blocks over the tracked query functions
 * and tables (occupancy over time, busy hours, flow matrix, key figures, incidents, segment trends,
 * device health, deliveries; `./widget-blocks.ts` lists them for dashboards), the Analytics page
 * composing them for the sidebar facility and a period, and dashboards: members' own grids of those
 * blocks (`./dashboard.ts`, the grid block `itap:dashboard-grid`, the editor field
 * `itap.dashboard-widgets`), one of which can be the landing page; and reports: requested by hand,
 * by a schedule or from an incident, generated in the background and opened as files, with their
 * templates and schedules (`./report*.ts`, the progress block `itap:report-status`, the cron field
 * `itap.cron`).
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
    deviceHealthDayBlock,
    dashboard,
    dashboardGridBlock,
    facilityZoneQuery,
    occupancySeries,
    flowMatrix,
    heatmapHours,
    incidentsList,
    segmentTrend,
    deviceHealthSummary,
    deviceHealthDay,
    readableRootFields,
    report,
    reportTemplate,
    reportSchedule,
    reportFacility,
    reportSegment,
    reportStatusBlock,
    createReport,
    retryReport,
    reportProgressQuery,
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
    [DASHBOARD_RESOURCE]: hasuraTable('dashboards', { selectFields: selectFieldsOf(dashboardFields) }),
    [REPORT_RESOURCE]: hasuraTable('reports', { selectFields: selectFieldsOf(reportFields) }),
    [REPORT_TEMPLATE_RESOURCE]: hasuraTable('report_templates', { selectFields: selectFieldsOf(reportTemplateFields) }),
    [REPORT_SCHEDULE_RESOURCE]: hasuraTable('report_schedules', { selectFields: selectFieldsOf(reportScheduleFields) }),
    [REPORT_FACILITY_RESOURCE]: hasuraTable('report_facilities', { selectFields: selectFieldsOf(reportFacilityFields) }),
    [REPORT_SEGMENT_RESOURCE]: hasuraTable('report_segments', { selectFields: selectFieldsOf(reportSegmentFields) }),
  },
  operations: [
    facilityZoneOperation,
    occupancySeriesOperation,
    flowMatrixOperation,
    heatmapOperation,
    incidentsListOperation,
    segmentTrendOperation,
    deviceHealthSummaryOperation,
    deviceHealthDayOperation,
    readableFieldsOperation,
    ...REPORT_OPERATIONS,
  ],
} as const satisfies ConsoleModule;
