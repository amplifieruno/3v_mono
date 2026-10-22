import { describe, expect, it } from 'vitest';
import { contractProblems, dashboardProblems, widgetEntryName, widgetSettings } from '../../src/modules/analytics/dashboard-contract';
import { dashboardWidgetsField } from '../../src/fields/dashboard-widgets';
import { expectTranslated } from '../support/field-issues';

/**
 * The dashboard contract checked in the console with the database's rules
 * (`itap.valid_dashboard_widgets`; the cases mirror `apps/backend/tests/integration/dashboards.test.ts`),
 * each refusal naming its widget, and the widget settings read by the block each widget renders.
 */

type Widget = Record<string, unknown>;

const FACILITY = '22222222-2222-4222-8222-222222222222';

function widget(overrides: Widget = {}): Widget {
  return { id: 'kpis', kind: 'kpi', title: 'Today', query: 'dashboard_kpis', params: {}, position: { x: 0, y: 0, w: 12, h: 2 }, ...overrides };
}

const codes = (value: unknown) => contractProblems(value).map((problem) => problem.code.replace('dashboardWidgets.', ''));

describe('dashboard widget contract', () => {
  it('should accept every kind with each of its queries, and an empty dashboard', () => {
    const valid = [
      widget(),
      widget({ id: 'occ', kind: 'occupancy_series', query: 'occupancy_series', params: { bucket: 'hour' } }),
      widget({ id: 'now', kind: 'occupancy_series', query: 'facility_occupancy_now' }),
      widget({ id: 'flow', kind: 'flow_matrix', query: 'flow_matrix' }),
      widget({ id: 'heat', kind: 'heatmap', query: 'area_hourly_stats' }),
      widget({ id: 'heat2', kind: 'heatmap', query: 'occupancy_series' }),
      widget({ id: 'inc', kind: 'incidents_list', query: 'incidents', params: { limit: 10 } }),
      widget({ id: 'seg', kind: 'segment_trend', query: 'segment_daily_stats' }),
      widget({ id: 'dev', kind: 'device_health', query: 'devices' }),
      widget({ id: 'dev2', kind: 'device_health', query: 'device_health_metrics' }),
      widget({ id: 'del', kind: 'deliveries', query: 'delivery_report', position: { x: 0, y: 14, w: 12, h: 3 } }),
    ];
    expect(contractProblems(valid)).toEqual([]);
    expect(contractProblems([])).toEqual([]);
  });

  it('should count characters and strip only spaces, like the database', () => {
    const astral = '😀';
    expect(codes([widget({ id: astral.repeat(64) })])).toEqual([]);
    expect(codes([widget({ id: astral.repeat(65) })])).toEqual(['id']);
    expect(codes([widget({ title: astral.repeat(200) })])).toEqual([]);
    expect(codes([widget({ title: astral.repeat(201) })])).toEqual(['title']);
    expect(codes([widget({ title: '   ' })])).toEqual(['title']);
    expect(codes([widget({ title: '\t' })])).toEqual([]);
  });

  it('should refuse what the database refuses, each with its reason', () => {
    const noPosition = Object.fromEntries(Object.entries(widget()).filter(([key]) => key !== 'position'));
    const cases: [unknown, string[]][] = [
      [{ not: 'an array' }, ['notList']],
      [[widget({ kind: 'pie_chart' })], ['kind']],
      [[widget({ query: 'profiles' })], ['query']],
      [[widget({ kind: 'kpi', query: 'flow_matrix' })], ['query']],
      [[widget({ id: '' })], ['id']],
      [[widget({ id: 'x'.repeat(65) })], ['id']],
      [[widget(), widget()], ['duplicateId']],
      [[widget({ title: '   ' })], ['title']],
      [[widget({ title: 't'.repeat(201) })], ['title']],
      [[widget({ params: [] })], ['params']],
      [[noPosition], ['keys']],
      [[widget({ extra: true })], ['keys']],
      [[widget({ position: { x: 0, y: 0, w: 0, h: 2 } })], ['positionRange']],
      [[widget({ position: { x: 6, y: 0, w: 8, h: 2 } })], ['positionWidth']],
      [[widget({ position: { x: 1, y: 0, w: 12, h: 2 } })], ['positionWidth']],
      [[widget({ position: { x: 0.5, y: 0, w: 4, h: 2 } })], ['positionRange']],
      [[widget({ position: { x: 0, y: -1, w: 4, h: 2 } })], ['positionRange']],
      [[widget({ position: { x: 0, y: 1001, w: 4, h: 2 } })], ['positionRange']],
      [[widget({ position: { x: 0, y: 0, w: 4, h: 25 } })], ['positionRange']],
      [[widget({ position: { x: 0, y: 0, w: 4 } })], ['positionKeys']],
      [['kpi'], ['notWidget']],
      [Array.from({ length: 51 }, (_, i) => widget({ id: `w${i}` })), ['tooMany']],
    ];
    for (const [value, expected] of cases) expect(codes(value), JSON.stringify(value).slice(0, 80)).toEqual(expected);
  });

  it('should accept 50 widgets and integral positions written as decimals', () => {
    expect(contractProblems(Array.from({ length: 50 }, (_, i) => widget({ id: `w${i}` })))).toEqual([]);
    expect(contractProblems([widget({ position: { x: 5.0, y: 0, w: 7.0, h: 2 } })])).toEqual([]);
  });

  it('should name the widget that fails, by its place and title', () => {
    const [problem] = contractProblems([widget(), widget({ id: 'busy', title: 'Busy hours', position: { x: 8, y: 2, w: 6, h: 4 } })]);
    expect(problem).toMatchObject({ index: 1, code: 'dashboardWidgets.positionWidth' });
    expect(problem?.text).toBe('Widget 2 “Busy hours”: x + w must be at most 12 (it is 8 + 6).');
    const [duplicate] = contractProblems([widget(), widget({ title: 'Again' })]);
    expect(duplicate?.text).toBe('Widget 2 “Again”: repeats the id “kpis” of widget 1.');
  });

  it('should carry every refusal’s text in the bundle', async () => {
    const all = [
      ...contractProblems({}),
      ...contractProblems(Array.from({ length: 51 }, () => widget())),
      ...contractProblems(['x', widget({ id: '', kind: 'x', title: '' }), widget({ params: 1, position: {} }), widget({ extra: 1 })]),
      ...contractProblems([widget({ id: 'a', query: 'q' }), widget({ id: 'a', position: { x: 0, y: 0, w: 0, h: 1 } }), widget({ id: 'b', position: { x: 9, y: 0, w: 9, h: 1 } })]),
      ...dashboardProblems([widget({ params: { colour: 'red' } })]),
    ];
    expect(new Set(all.map((problem) => problem.code)).size).toBe(14);
    for (const problem of all) await expectTranslated(problem);
  });
});

describe('dashboard widget settings', () => {
  it('should tell the two device health sources apart by the device key', () => {
    expect(widgetEntryName('device_health', 'device_health_metrics', { device_id: null })).toBe('deviceHealthChart');
    expect(widgetEntryName('device_health', 'device_health_metrics', { facility_id: FACILITY, hours: 24 })).toBe('deviceHealthDay');
    expect(widgetEntryName('heatmap', 'occupancy_series', {})).toBe('heatmapSeries');
    expect(widgetEntryName('kpi', 'flow_matrix', {})).toBeNull();
  });

  it('should refuse settings the block refuses, naming the widget and the reason (heatmap over 31 days)', () => {
    const busy = widget({ id: 'busy', kind: 'heatmap', title: 'Busy hours', query: 'area_hourly_stats', params: { facility_id: FACILITY, days: 45 } });
    const read = widgetSettings(busy as never);
    expect(read.ok).toBe(false);
    expect(read.ok ? '' : read.reason).toMatch(/^days: /u);
    const [problem] = dashboardProblems([widget(), busy]);
    expect(problem).toMatchObject({ index: 1, code: 'dashboardWidgets.settings' });
    expect(problem?.text).toMatch(/^Widget 2 “Busy hours”: its settings are refused \(days: /u);
  });

  it('should read the seeded dashboards without a refusal', () => {
    const seeded = [
      widget({ id: 'open-incidents', kind: 'incidents_list', query: 'incidents', params: { status: ['open', 'acknowledged', 'investigating'], limit: 10 } }),
      widget({ id: 'occupancy-now', kind: 'occupancy_series', query: 'facility_occupancy_now', params: { facility_id: FACILITY } }),
      widget({ id: 'devices', kind: 'device_health', query: 'devices', params: { facility_id: FACILITY } }),
      widget({ id: 'deliveries', kind: 'deliveries', query: 'delivery_report', params: { days: 7 } }),
      widget({ id: 'occupancy-week', kind: 'occupancy_series', query: 'occupancy_series', params: { facility_id: FACILITY, bucket: 'hour', days: 7 } }),
      widget({ id: 'busy-hours', kind: 'heatmap', query: 'area_hourly_stats', params: { facility_id: FACILITY, days: 30 } }),
      widget({ id: 'flows', kind: 'flow_matrix', query: 'flow_matrix', params: { facility_id: FACILITY, days: 30 } }),
      widget({ id: 'segments', kind: 'segment_trend', query: 'segment_daily_stats', params: { days: 30 } }),
      widget({ id: 'device-health', kind: 'device_health', query: 'device_health_metrics', params: { facility_id: FACILITY, hours: 24 } }),
    ];
    expect(dashboardProblems(seeded)).toEqual([]);
  });

  it('should refuse the save with one issue per refusal through the field validator', () => {
    const validate = (dashboardWidgetsField().opts as { readonly validate?: unknown }).validate as (value: unknown) => unknown;
    expect(validate([widget()])).toBeNull();
    expect(validate([widget(), widget()])).toEqual([
      expect.objectContaining({ code: 'dashboardWidgets.duplicateId', message: expect.objectContaining({ key: 'validation.itap.dashboardWidgets.duplicateId' }) }),
    ]);
  });
});
