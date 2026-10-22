import { describe, expect, it } from 'vitest';
import { activeChannels, outcomeParts, outcomeTotals } from '../../src/blocks/deliveries/deliveries-shape';
import type { ReportRow } from '../../src/blocks/delivery-report/delivery-report-query';
import { type DeviceRow, devicesNeedingAttention, healthParts } from '../../src/blocks/device-health-summary/device-health-summary-shape';
import { flowGrid } from '../../src/blocks/flow-matrix/flow-matrix-shape';
import { busiestCell, heatByArea, heatByWeekday, hourColumns, seriesHours } from '../../src/blocks/heatmap/heatmap-shape';
import { incidentWhere } from '../../src/blocks/incidents-list/incidents-list-query';
import { type SeriesRow, seriesPoints, seriesTotals } from '../../src/blocks/occupancy-series/occupancy-series-shape';
import { segmentTrends, trendReadStart } from '../../src/blocks/segment-trend/segment-trend-shape';
import { shortDay, zonedDateTime } from '../../src/blocks/charts/zoned-time';
import { ANALYTIC_BLOCKS, DASHBOARD_WIDGET_QUERIES, analyticBlockProps } from '../../src/modules/analytics/widget-blocks';

/** How the analytic blocks shape what they read into what they draw. */

const MOSCOW = 'Europe/Moscow';

const seriesRow = (bucket_start: string, day: string | null, figures: Partial<SeriesRow> = {}): SeriesRow => ({
  bucket_start,
  day,
  unique_identities: 0,
  entries: 0,
  exits: 0,
  dwell_seconds: 0,
  avg_dwell_seconds: null,
  peak_occupancy: 0,
  ...figures,
});

describe('occupancy series', () => {
  it('should name a day bucket by the facility’s day the server cut, not by its start in the browser’s zone', () => {
    // A Moscow day starts at 21:00 UTC the evening before: read in UTC it would be 21 October.
    const points = seriesPoints([seriesRow('2026-10-21T21:00:00+00:00', '2026-10-22', { unique_identities: 4 })], 'day', MOSCOW);
    expect(points[0]?.label).toBe(shortDay('2026-10-22'));
    expect(points[0]?.people).toBe(4);
  });

  it('should name an hour bucket by the facility’s clock', () => {
    const [point] = seriesPoints([seriesRow('2026-10-22T13:00:00+00:00', null)], 'hour', MOSCOW);
    // 13:00 UTC is 16:00 in Moscow: the same reading as 16:00 written for UTC.
    expect(point?.label).toBe(zonedDateTime('2026-10-22T16:00:00Z', 'UTC'));
  });

  it('should total the entries and exits and find the first peak', () => {
    const points = seriesPoints(
      [
        seriesRow('2026-10-21T21:00:00Z', '2026-10-22', { entries: 5, exits: 4, peak_occupancy: 3 }),
        seriesRow('2026-10-22T21:00:00Z', '2026-10-23', { entries: 7, exits: 2, peak_occupancy: 6 }),
        seriesRow('2026-10-23T21:00:00Z', '2026-10-24', { entries: 1, exits: 1, peak_occupancy: 6 }),
      ],
      'day',
      MOSCOW,
    );
    expect(seriesTotals(points)).toEqual({ entries: 13, exits: 7, peak: 6, peakAt: shortDay('2026-10-23') });
  });
});

describe('flow matrix', () => {
  const read = {
    rows: [
      { from_area_id: 'a', to_area_id: 'b', count: 10 },
      { from_area_id: 'b', to_area_id: 'c', count: 4 },
      { from_area_id: 'c', to_area_id: 'a', count: 2 },
      { from_area_id: 'd', to_area_id: 'a', count: 1 },
    ],
    areas: [
      { id: 'a', name: 'Lobby' },
      { id: 'b', name: 'Office' },
      { id: 'c', name: 'Cafe' },
    ],
  };

  it('should keep the busiest areas and count the moves it leaves out', () => {
    const grid = flowGrid(read, 3, 'Removed area');
    expect(grid.areas.map((area) => area.label)).toEqual(['Office', 'Lobby', 'Cafe']);
    // Rows are "from", columns "to", in the same order: Office, Lobby, Cafe.
    expect(grid.cells).toEqual([
      [0, 0, 4],
      [10, 0, 0],
      [0, 2, 0],
    ]);
    expect(grid.total).toBe(17);
    expect(grid.hidden).toBe(1);
    expect(grid.top[0]).toEqual({ from: 'Lobby', to: 'Office', count: 10 });
    expect(grid.top.at(-1)).toEqual({ from: 'Removed area', to: 'Lobby', count: 1 });
  });
});

describe('heatmap', () => {
  const read = {
    rows: [
      // 06:00 UTC = 09:00 in Moscow, on Monday 19 October 2026.
      { area_id: 'a', hour: '2026-10-19T06:00:00+00:00', dwell_seconds: 7200 },
      { area_id: 'a', hour: '2026-10-20T06:00:00+00:00', dwell_seconds: 3600 },
      { area_id: 'b', hour: '2026-10-19T21:00:00+00:00', dwell_seconds: 1800 },
      { area_id: null, hour: '2026-10-19T06:00:00+00:00', dwell_seconds: 9000 },
      // 21:00 UTC on Sunday 18 October is already Monday 00:00 in Moscow.
      { area_id: null, hour: '2026-10-18T21:00:00+00:00', dwell_seconds: 3600 },
    ],
    areas: [
      { id: 'a', name: 'Lobby' },
      { id: 'b', name: 'Office' },
    ],
    truncated: false,
  };
  const days = ['2026-10-19', '2026-10-20'];

  it('should average presence per clock hour of the facility, by area', () => {
    const heat = heatByArea(read, days, MOSCOW, 10, 'Removed area');
    expect(heat.rows.map((row) => row.label)).toEqual(['Lobby', 'Office']);
    expect(heat.columns).toHaveLength(24);
    expect(heat.cells[0]?.[9]).toBeCloseTo(1.5); // (2 h + 1 h) over 2 days at 09:00
    expect(heat.cells[1]?.[0]).toBeCloseTo(0.25); // 21:00 UTC is midnight in Moscow
    expect(heat.cells[0]?.[6]).toBe(0);
  });

  it('should average the whole facility per weekday of the facility, leaving weekdays the period lacks empty', () => {
    const heat = heatByWeekday(read, days, MOSCOW);
    expect(heat.rows).toHaveLength(7);
    expect(heat.cells[0]?.[9]).toBeCloseTo(2.5); // Monday 09:00: 9000 s over one Monday
    expect(heat.cells[0]?.[0]).toBeCloseTo(1); // Sunday 21:00 UTC is Monday 00:00 in Moscow
    expect(heat.cells[1]?.[9]).toBe(0); // Tuesday is in the period, nobody at 09:00
    expect(heat.cells[2]?.[9]).toBeNull(); // no Wednesday in the period
  });

  it('should name the busiest cell and read the hourly series as facility rows', () => {
    expect(busiestCell(heatByArea(read, days, MOSCOW, 10, 'Removed area'))).toEqual({ row: 'Lobby', column: '09:00', value: 1.5 });
    const fromSeries = seriesHours([{ bucket_start: '2026-10-19T06:00:00+00:00', dwell_seconds: 7200 }]);
    expect(heatByWeekday(fromSeries, days, MOSCOW).cells[0]?.[9]).toBeCloseTo(2);
  });

  it('should write every third hour on the axis', () => {
    expect(hourColumns().map((column) => column.short).slice(0, 4)).toEqual(['00', '', '', '03']);
  });
});

describe('segment trend', () => {
  it('should draw the organization’s days up to its today and the largest segments first', () => {
    const now = new Date('2026-10-22T22:30:00Z'); // 23 October in Moscow
    const rows = [
      { segment_id: 's1', day: '2026-10-21', member_count: 4, segment: { name: 'Staff' } },
      { segment_id: 's1', day: '2026-10-23', member_count: 6, segment: { name: 'Staff' } },
      { segment_id: 's2', day: '2026-10-23', member_count: 9, segment: { name: 'Visitors' } },
      { segment_id: 's3', day: '2026-10-10', member_count: 50, segment: { name: 'Old' } },
    ];
    const trends = segmentTrends({ timezone: MOSCOW, rows }, now, 3, 5);
    expect(trends.map((trend) => trend.name)).toEqual(['Visitors', 'Staff']);
    const staff = trends[1];
    expect(staff?.points.map((point) => point.value)).toEqual([4, null, 6]);
    expect(staff?.latest).toBe(6);
    expect(staff?.change).toBe(2);
    expect(trendReadStart(now, 3)).toBe('2026-10-18');
  });
});

describe('device health summary', () => {
  const device = (id: string, health_status: string, status = 'active', last_seen_at: string | null = null): DeviceRow => ({
    id,
    name: id,
    status,
    health_status,
    last_seen_at,
    facility: null,
  });

  it('should count every health status and list the urgent devices first', () => {
    const devices = [
      device('ok', 'healthy'),
      device('warn', 'warning'),
      device('down', 'critical', 'connection_error', '2026-10-22T10:00:00Z'),
      device('older', 'critical', 'active', '2026-10-20T10:00:00Z'),
      device('faulty', 'unknown', 'error'),
    ];
    expect(healthParts(devices, (status) => status.toUpperCase()).map((part) => [part.key, part.value])).toEqual([
      ['healthy', 1],
      ['warning', 1],
      ['critical', 2],
      ['unknown', 1],
    ]);
    expect(healthParts(devices, (status) => status.toUpperCase())[0]?.label).toBe('HEALTHY');
    expect(devicesNeedingAttention(devices).map((row) => row.id)).toEqual(['older', 'down', 'faulty', 'warn']);
  });
});

describe('deliveries', () => {
  const row = (channel: string, total: number): ReportRow => ({
    channel,
    total,
    pending: 0,
    sent: 1,
    delivered: total - 1,
    failed: 0,
    dead_letter: 0,
    digested: 0,
    acknowledged: 0,
    ack_rate: null,
    avg_response_seconds: null,
    escalations: 0,
  });

  it('should keep the channels with deliveries, busiest first, on one scale', () => {
    const { channels, scale } = activeChannels([row('email', 3), row('sms', 0), row('in_app', 8)]);
    expect(channels.map((channel) => channel.channel)).toEqual(['in_app', 'email']);
    expect(scale).toBe(8);
    expect(outcomeParts(row('email', 3), (key) => key).map((part) => part.value)).toEqual([2, 1, 0, 0, 0]);
    expect(outcomeTotals(channels)).toEqual({ delivered: 9, sent: 2, pending: 0, failed: 0, dead_letter: 0 });
  });
});

describe('incidents list filter', () => {
  it('should ask for open incidents of the severity and above, of the facility and of none', () => {
    expect(incidentWhere({ facilityId: 'f1', status: 'open', minSeverity: 'high', limit: 5 })).toEqual({
      severity: { _in: ['high', 'critical'] },
      status: { _nin: ['resolved', 'closed'] },
      _or: [{ facility_id: { _eq: 'f1' } }, { facility_id: { _is_null: true } }],
    });
    expect(incidentWhere({ facilityId: null, status: 'all', minSeverity: 'info', limit: 5 })).toEqual({
      severity: { _in: ['info', 'low', 'medium', 'high', 'critical'] },
    });
  });
});

describe('widget params', () => {
  const FACILITY = '11111111-1111-4111-8111-111111111111';

  it('should read a widget’s params as the block’s props, absent ones left to the block’s defaults', () => {
    expect(analyticBlockProps('occupancySeries', { facility_id: FACILITY, days: 30 })).toEqual({
      ok: true,
      props: { facilityId: FACILITY, days: 30 },
    });
    expect(analyticBlockProps('incidentsList', { min_severity: 'high' })).toEqual({ ok: true, props: { minSeverity: 'high' } });
    expect(analyticBlockProps('kpis', undefined)).toEqual({ ok: true, props: {} });
  });

  it('should refuse unknown keys and values out of range, naming them', () => {
    const refused = analyticBlockProps('heatmap', { facility_id: 'nope', days: 0, colour: 'red' });
    expect(refused.ok).toBe(false);
    expect(refused.ok ? [] : refused.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(['facility_id', 'days']));
    expect(analyticBlockProps('flowMatrix', { colour: 'red' }).ok).toBe(false);
    expect(analyticBlockProps('heatmap', { days: 32 }).ok).toBe(false);
    expect(analyticBlockProps('kpis', { figures: ['open_incidents', 'open_incidents'] }).ok).toBe(false);
  });

  it('should fix the series heatmap to the facility by weekday', () => {
    expect(analyticBlockProps('heatmapSeries', { facility_id: FACILITY })).toEqual({
      ok: true,
      props: { facilityId: FACILITY, source: 'series', by: 'weekday' },
    });
    expect(analyticBlockProps('heatmapSeries', { by: 'area' }).ok).toBe(false);
  });

  it('should cover exactly the widget contract’s kind and query pairs', () => {
    const allowed = Object.entries(DASHBOARD_WIDGET_QUERIES)
      .flatMap(([kind, queries]) => queries.map((query) => `${kind} → ${query}`))
      .sort();
    const read = [...new Set(Object.values(ANALYTIC_BLOCKS).map((entry) => `${entry.kind} → ${entry.query}`))].sort();
    expect(read).toEqual(allowed);
  });

  it('should read the seed’s widget params (statuses, delivery days, device health hours)', () => {
    expect(analyticBlockProps('incidentsList', { status: ['open', 'acknowledged', 'investigating'], limit: 10 })).toEqual({
      ok: true,
      props: { status: ['open', 'acknowledged', 'investigating'], limit: 10 },
    });
    expect(analyticBlockProps('deliveries', { days: 7 })).toEqual({ ok: true, props: { period: '7d' } });
    expect(analyticBlockProps('deliveries', { days: 5 }).ok).toBe(false);
    expect(analyticBlockProps('deliveries', { days: 7, period: '7d' }).ok).toBe(false);
    expect(analyticBlockProps('deviceHealthDay', { facility_id: FACILITY, hours: 24 })).toEqual({ ok: true, props: { facilityId: FACILITY } });
    expect(analyticBlockProps('deviceHealthDay', { hours: 12 }).ok).toBe(false);
    expect(analyticBlockProps('deviceHealthChart', { device_id: null })).toEqual({ ok: true, props: { deviceId: null } });
  });

  it('should name the root field each block reads', () => {
    expect(Object.fromEntries(Object.entries(ANALYTIC_BLOCKS).map(([name, entry]) => [name, entry.query]))).toEqual({
      kpis: 'dashboard_kpis',
      occupancySeries: 'occupancy_series',
      occupancyNow: 'facility_occupancy_now',
      flowMatrix: 'flow_matrix',
      heatmap: 'area_hourly_stats',
      incidentsList: 'incidents',
      segmentTrend: 'segment_daily_stats',
      heatmapSeries: 'occupancy_series',
      deviceHealthSummary: 'devices',
      deviceHealthChart: 'device_health_metrics',
      deviceHealthDay: 'device_health_metrics',
      deliveries: 'delivery_report',
    });
  });
});
