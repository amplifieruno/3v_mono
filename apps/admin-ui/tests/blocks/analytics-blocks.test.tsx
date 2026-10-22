// @vitest-environment jsdom
import { renderBlock } from '@burojs/testing/react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deliveriesBlock } from '../../src/blocks/deliveries/deliveries-block';
import { deliveriesView } from '../../src/blocks/deliveries/views';
import { deviceHealthSummaryBlock } from '../../src/blocks/device-health-summary/device-health-summary-block';
import { deviceHealthSummaryView } from '../../src/blocks/device-health-summary/views';
import { flowMatrixBlock } from '../../src/blocks/flow-matrix/flow-matrix-block';
import { flowMatrixView } from '../../src/blocks/flow-matrix/views';
import { heatmapBlock } from '../../src/blocks/heatmap/heatmap-block';
import { HEATMAP_ROW_LIMIT } from '../../src/blocks/heatmap/heatmap-query';
import { heatmapView } from '../../src/blocks/heatmap/views';
import { incidentsListBlock } from '../../src/blocks/incidents-list/incidents-list-block';
import { incidentsListView } from '../../src/blocks/incidents-list/views';
import { kpisBlock } from '../../src/blocks/kpis/kpis-block';
import { kpisView } from '../../src/blocks/kpis/views';
import { segmentTrendBlock } from '../../src/blocks/segment-trend/segment-trend-block';
import { segmentTrendView } from '../../src/blocks/segment-trend/views';
import { Wrapper } from '../support/analytics-dom';
import { type Answers, FACILITY, messagesOf, stubHasura } from '../support/analytics-fake';
import { installDomShims } from '../support/console-dom';

/**
 * The analytic blocks drawn from a fake server: each reads its query with the block's params
 * (facility, period, filters) and draws what the answer holds.
 */

const NOW = new Date('2026-10-22T10:00:00Z');
let answers: Answers = {};
let sent: ReturnType<typeof stubHasura>;

beforeAll(installDomShims);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  answers = { FacilityZone: { facilities_by_pk: { id: FACILITY, name: 'Nova Tower', timezone: 'Europe/Moscow' } } };
  sent = stubHasura(() => answers);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const AREAS = [
  { id: 'a', name: 'Lobby' },
  { id: 'b', name: 'Office' },
];

describe('the analytic blocks', () => {
  it('should draw the key figures, the severities and the segment movers', async () => {
    answers.DashboardKpis = {
      dashboard_kpis: [
        {
          as_of: NOW.toISOString(),
          local_date: '2026-10-22',
          unique_visitors_today: 42,
          current_occupancy: 7,
          open_incidents: 5,
          open_incidents_critical: 1,
          open_incidents_high: 2,
          open_incidents_medium: 2,
          open_incidents_low: 0,
          open_incidents_info: 0,
          devices_offline: 1,
          deliveries_failed_24h: 0,
          segment_top_movers: [{ segment_id: 's', code: 'SEG-1', name: 'Staff', member_count: 9, previous_count: 12, change: -3 }],
        },
      ],
    };
    await renderBlock(kpisView, { props: { figures: ['unique_visitors_today', 'open_incidents'] }, wrapper: Wrapper, messages: messagesOf(kpisBlock) });
    expect((await screen.findByTestId('kpi:unique_visitors_today')).textContent).toContain('42');
    expect(screen.queryByTestId('kpi:current_occupancy')).toBeNull();
    expect(screen.getAllByTestId('kpis:severities-part').map((part) => part.getAttribute('data-part'))).toEqual(['critical', 'high', 'medium']);
    expect(screen.getByTestId('kpis:movers').textContent).toContain('12 → 9');
  });

  it('should read the flow matrix for the facility’s days and label it with its areas', async () => {
    answers.FlowMatrix = {
      flow_matrix: [
        { from_area_id: 'a', to_area_id: 'b', count: 9 },
        { from_area_id: 'b', to_area_id: 'a', count: 3 },
      ],
      areas: AREAS,
    };
    await renderBlock(flowMatrixView, { props: { facilityId: FACILITY, days: 7 }, wrapper: Wrapper, messages: messagesOf(flowMatrixBlock) });
    expect((await screen.findByTestId('flow-matrix:top')).textContent).toContain('Lobby → Office');
    expect(screen.getByText(/12 moves over the period/)).toBeDefined();
    expect(screen.getAllByTestId('flow-matrix:grid-cell')).toHaveLength(4);
    expect(sent().find((request) => request.operation === 'FlowMatrix')?.variables).toEqual({
      facility: FACILITY,
      from: '2026-10-15T21:00:00.000Z',
      to: '2026-10-22T21:00:00.000Z',
    });
  });

  it('should read the area hours of the period for a heatmap by area', async () => {
    answers.HeatmapHours = { area_hourly_stats: [{ area_id: 'a', hour: '2026-10-21T06:00:00+00:00', dwell_seconds: 3600 }], areas: AREAS };
    await renderBlock(heatmapView, { props: { facilityId: FACILITY, days: 7 }, wrapper: Wrapper, messages: messagesOf(heatmapBlock) });
    const cells = await screen.findAllByTestId('heatmap:grid-cell');
    expect(cells).toHaveLength(24);
    expect(cells.filter((cell) => cell.getAttribute('data-level') !== '0')).toHaveLength(1);
    expect(sent().find((request) => request.operation === 'HeatmapHours')?.variables).toMatchObject({ total: false });
    // The figures behind the drawing, as a table and in the accessible name.
    const table = screen.getByTestId('heatmap:grid-table');
    expect(table.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(table.textContent).toContain('Lobby');
    expect(screen.getByRole('img', { name: /busiest Lobby at 09:00/ })).toBeDefined();
    expect(screen.queryByTestId('heatmap:truncated')).toBeNull();
  });

  it('should say when the hourly read was cut at its limit', async () => {
    const rows = Array.from({ length: HEATMAP_ROW_LIMIT }, (_, index) => ({
      area_id: 'a',
      hour: new Date(Date.parse('2026-10-21T06:00:00Z') - (index % 100) * 3_600_000).toISOString(),
      dwell_seconds: 60,
    }));
    answers.HeatmapHours = { area_hourly_stats: rows, areas: AREAS };
    await renderBlock(heatmapView, { props: { facilityId: FACILITY, days: 7 }, wrapper: Wrapper, messages: messagesOf(heatmapBlock) });
    expect((await screen.findByTestId('heatmap:truncated')).textContent).toContain('oldest hours');
  });

  it('should read a series heatmap from the hourly occupancy series, by weekday', async () => {
    answers.OccupancySeries = {
      occupancy_series: [
        { bucket_start: '2026-10-21T06:00:00+00:00', day: null, unique_identities: 2, entries: 2, exits: 0, dwell_seconds: 7200, avg_dwell_seconds: 3600, peak_occupancy: 2 },
      ],
    };
    await renderBlock(heatmapView, { props: { facilityId: FACILITY, days: 7, source: 'series' }, wrapper: Wrapper, messages: messagesOf(heatmapBlock) });
    expect((await screen.findByLabelText('Busy hours')).getAttribute('data-by')).toBe('weekday');
    expect(sent().find((request) => request.operation === 'OccupancySeries')?.variables).toMatchObject({ bucket: 'hour' });
    expect(sent().some((request) => request.operation === 'HeatmapHours')).toBe(false);
  });

  it('should list the newest open incidents of the facility with links', async () => {
    answers.IncidentsList = {
      incidents: [
        {
          id: 'i1',
          code: 'INC-00001',
          title: 'Tailgating at the gate',
          severity: 'high',
          status: 'open',
          created_at: NOW.toISOString(),
          facility: { name: 'Nova Tower' },
          area: null,
        },
      ],
      incidents_aggregate: { aggregate: { count: 3 } },
    };
    await renderBlock(incidentsListView, { props: { facilityId: FACILITY, limit: 1 }, wrapper: Wrapper, messages: messagesOf(incidentsListBlock) });
    expect((await screen.findByRole('link', { name: /INC-00001/ })).getAttribute('href')).toContain('i1');
    expect(screen.getByText('The newest 1 of 3.')).toBeDefined();
    expect(sent().find((request) => request.operation === 'IncidentsList')?.variables).toMatchObject({ limit: 1 });
  });

  it('should count the devices by health and list the offline ones', async () => {
    answers.DeviceHealthSummary = {
      devices: [
        { id: 'd1', name: 'Gate camera', status: 'connection_error', health_status: 'critical', last_seen_at: null, facility: { name: 'Nova Tower' } },
        { id: 'd2', name: 'Lobby camera', status: 'active', health_status: 'healthy', last_seen_at: NOW.toISOString(), facility: null },
      ],
    };
    await renderBlock(deviceHealthSummaryView, { props: { facilityId: null }, wrapper: Wrapper, messages: messagesOf(deviceHealthSummaryBlock) });
    expect(await screen.findByText('2 devices in service')).toBeDefined();
    expect(screen.getAllByTestId('device-health-summary-row').map((row) => row.textContent)).toEqual([expect.stringContaining('Gate camera')]);
    expect(sent().find((request) => request.operation === 'DeviceHealthSummary')?.variables).toEqual({ where: { status: { _neq: 'inactive' } } });
  });

  it('should draw one bar per channel with deliveries', async () => {
    const zero = { pending: 0, sent: 0, delivered: 0, failed: 0, dead_letter: 0, digested: 0, acknowledged: 0, escalations: 0, ack_rate: null, avg_response_seconds: null };
    answers.DeliveryReport = {
      delivery_report: [
        { ...zero, channel: 'email', total: 4, delivered: 3, dead_letter: 1 },
        { ...zero, channel: 'sms', total: 0 },
      ],
    };
    await renderBlock(deliveriesView, { props: { period: '24h' }, wrapper: Wrapper, messages: messagesOf(deliveriesBlock) });
    expect((await screen.findByTestId('deliveries:problems')).textContent).toContain('1');
    expect(screen.getByTestId('deliveries:email')).toBeDefined();
    expect(screen.queryByTestId('deliveries:sms')).toBeNull();
    // The legend carries the figures and is read out; the bar is named by the channel's label.
    const legend = screen.getByRole('list', { name: 'Outcomes over every channel' });
    expect(legend.textContent).toContain('Delivered3');
    expect(legend.textContent).toContain('Given up1');
    expect(screen.getByRole('img', { name: /Deliveries of Email by outcome: Delivered 3/ })).toBeDefined();
  });

  it('should draw the segments’ member counts over the organization’s days', async () => {
    answers.SegmentTrend = {
      organizations: [{ timezone: 'Europe/Moscow' }],
      segment_daily_stats: [
        { segment_id: 's1', day: '2026-10-20', member_count: 3, segment: { name: 'Staff' } },
        { segment_id: 's1', day: '2026-10-22', member_count: 5, segment: { name: 'Staff' } },
      ],
    };
    await renderBlock(segmentTrendView, { props: { days: 7 }, wrapper: Wrapper, messages: messagesOf(segmentTrendBlock) });
    expect((await screen.findByTestId('segment-trend:s1')).textContent).toContain('now 5 · +2 over the period');
    expect(sent().find((request) => request.operation === 'SegmentTrend')?.variables).toEqual({ where: { day: { _gte: '2026-10-14' } } });
    expect(screen.getByTestId('segment-trend:s1-table').textContent).toContain('5');
    expect(screen.queryByTestId('segment-trend:truncated')).toBeNull();
  });
});
