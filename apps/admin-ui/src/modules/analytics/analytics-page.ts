import { defineCustomPage } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { ANALYTICS_PERIODS } from '../../blocks/charts/period';
import { deliveriesBlock } from '../../blocks/deliveries/deliveries-block';
import { deviceHealthSummaryBlock } from '../../blocks/device-health-summary/device-health-summary-block';
import { flowMatrixBlock } from '../../blocks/flow-matrix/flow-matrix-block';
import { heatmapBlock } from '../../blocks/heatmap/heatmap-block';
import { incidentsListBlock } from '../../blocks/incidents-list/incidents-list-block';
import { kpisBlock } from '../../blocks/kpis/kpis-block';
import { occupancySeriesBlock } from '../../blocks/occupancy-series/occupancy-series-block';
import { segmentTrendBlock } from '../../blocks/segment-trend/segment-trend-block';

/** The segment trend needs two days at least: the 24-hour tab shows the last week of segments. */
const SEGMENT_TREND_MIN_DAYS = 7;

/**
 * "Analytics" in the sidebar: the organization's key figures, then a period chosen as a tab (kept in
 * the URL; the last 7 days first, the last 24 hours, the last 30 days) with the occupancy over time,
 * the busy hours and the moves between areas of the facility chosen in the sidebar, the segment
 * trends and the notification deliveries of that period; under them the open incidents and the
 * device health of the facility (every facility when none is chosen). Every chart is a block a
 * dashboard widget can show on its own (`./widget-blocks.ts`).
 */
export const analyticsPage = defineCustomPage({
  name: 'analytics',
  icon: NAV_ICONS.analyticsOverview,
  path: '/analytics',
  texts: 'Analytics',
  section: NAV_SECTIONS.analytics,
  order: 1,
  body: (l) => {
    const facilityId = l.ref('scope', 'facility');
    return [
      l.panel([l.place(kpisBlock, { key: 'kpis' })], { key: 'key-figures', texts: 'Key figures' }),
      l.tabs(
        ANALYTICS_PERIODS.map(({ key, days, title }) =>
          l.panel(
            [
              l.panel([l.place(occupancySeriesBlock, { key: `occupancy-${key}`, props: { facilityId, days } })], {
                key: `occupancy-panel-${key}`,
                texts: 'Occupancy over time',
              }),
              l.panel([l.place(heatmapBlock, { key: `heatmap-${key}`, props: { facilityId, days } })], {
                key: `heatmap-panel-${key}`,
                texts: 'Busy hours',
              }),
              l.panel([l.place(flowMatrixBlock, { key: `flows-${key}`, props: { facilityId, days } })], {
                key: `flows-panel-${key}`,
                texts: 'Movement between areas',
              }),
              l.panel(
                [l.place(segmentTrendBlock, { key: `segments-${key}`, props: { days: Math.max(days, SEGMENT_TREND_MIN_DAYS) } })],
                { key: `segments-panel-${key}`, texts: 'Segment trends' },
              ),
              l.panel([l.place(deliveriesBlock, { key: `deliveries-${key}`, props: { period: key } })], {
                key: `deliveries-panel-${key}`,
                texts: 'Notification deliveries',
              }),
            ],
            { key: `last-${key}`, texts: title },
          ),
        ),
        { key: 'period' },
      ),
      l.panel([l.place(incidentsListBlock, { key: 'incidents', props: { facilityId } })], {
        key: 'incidents-panel',
        texts: 'Open incidents',
      }),
      l.panel([l.place(deviceHealthSummaryBlock, { key: 'devices', props: { facilityId } })], {
        key: 'devices-panel',
        texts: 'Device health',
      }),
    ];
  },
});
