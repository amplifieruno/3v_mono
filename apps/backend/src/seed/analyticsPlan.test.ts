import { describe, expect, it } from 'vitest';
import { validateHeader } from '../bulk/columns.js';
import { parseCsv } from '../bulk/csv.js';
import { bulkSearchCsv, contractorImportCsv, dashboards, partialImportCsv, type DashboardWidget } from './analyticsPlan.js';
import { pastReports, SCHEDULES, TEMPLATES } from './reportPlan.js';

const NOW = new Date('2026-10-19T18:30:00Z');
const TZ = 'Europe/Moscow';
const HEADER_OPTIONS = { updateKey: 'employee_id', customKeys: new Set<string>() };

const KIND_QUERIES: Record<string, string[]> = {
  kpi: ['dashboard_kpis'],
  occupancy_series: ['occupancy_series', 'facility_occupancy_now'],
  flow_matrix: ['flow_matrix'],
  heatmap: ['area_hourly_stats', 'occupancy_series'],
  incidents_list: ['incidents'],
  segment_trend: ['segment_daily_stats'],
  device_health: ['devices', 'device_health_metrics'],
  deliveries: ['delivery_report'],
};

/** Mirror of itap.valid_dashboard_widgets (migration *_create_dashboards). */
function validWidget(widget: DashboardWidget): boolean {
  const { x, y, w, h } = widget.position;
  return (
    (KIND_QUERIES[widget.kind] ?? []).includes(widget.query) &&
    widget.title.trim() !== '' &&
    [x, y, w, h].every(Number.isInteger) &&
    x >= 0 && w >= 1 && x + w <= 12 && y >= 0 && h >= 1 && h <= 24
  );
}

describe('seed report plan', () => {
  it('should have one system template per report type and schedules on existing templates', () => {
    expect(new Set(TEMPLATES.map((t) => t.report_type)).size).toBe(10);
    for (const s of SCHEDULES) expect(TEMPLATES.some((t) => t.name === s.template && t.report_type !== 'incident')).toBe(true);
  });

  it('should plan about ten past reports after their periods and before now, one of them failed', () => {
    const reports = pastReports(NOW, TZ);
    expect(reports.length).toBeGreaterThanOrEqual(9);
    expect(reports.length).toBeLessThanOrEqual(12);
    expect(reports.filter((r) => r.error)).toHaveLength(1);
    expect(reports.filter((r) => r.schedule === 'Weekly occupancy')).toHaveLength(3);
    expect(reports.filter((r) => r.schedule === 'Daily incidents')).toHaveLength(3);
    for (const r of reports.filter((x) => x.schedule)) {
      // 07:00 local run instants, generated a minute or two later.
      expect(new Date(r.runAt ?? 0).toISOString().slice(11, 16)).toBe('04:00');
      expect(r.generatedAt - (r.runAt ?? 0)).toBeGreaterThan(0);
      expect(r.generatedAt - (r.runAt ?? 0)).toBeLessThanOrEqual(5 * 60_000);
    }
    expect(reports.filter((x) => !x.schedule).every((x) => x.runAt === null)).toBe(true);
    for (const r of reports) {
      expect(r.generatedAt).toBeLessThan(NOW.getTime());
      expect(new Date(r.generatedAt).toISOString().slice(0, 10) > r.end_date).toBe(true);
      // Inside the 30 replayed days.
      expect(r.start_date >= '2026-09-19').toBe(true);
    }
  });

  it('should move the ad-hoc reports a week back on a Monday morning', () => {
    const early = pastReports(new Date('2026-10-19T05:00:00Z'), TZ);
    expect(early.every((r) => r.generatedAt < Date.parse('2026-10-19T05:00:00Z'))).toBe(true);
    expect(early.length).toBeGreaterThanOrEqual(8);
  });
});

describe('seed bulk inputs', () => {
  it('should build a valid contractor import of eight rows', () => {
    const [header, ...rows] = parseCsv(contractorImportCsv('2026-10-12').toString('utf8'));
    expect(validateHeader('profile_import', header, HEADER_OPTIONS)).toMatchObject({ ok: true });
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r[1] !== '' && r[3] === 'contractor')).toBe(true);
  });

  it('should build an import with three bad rows and a blank one', () => {
    const [header, ...rows] = parseCsv(partialImportCsv('2026-10-12').toString('utf8'));
    expect(validateHeader('profile_import', header, HEADER_OPTIONS)).toMatchObject({ ok: true });
    expect(rows).toHaveLength(7);
    expect(rows.filter((r) => r.every((c) => c === ''))).toHaveLength(1);
  });

  it('should list search images with labels', () => {
    const [header, ...rows] = parseCsv(bulkSearchCsv([{ fileId: 'f1', label: 'Lobby still' }]).toString('utf8'));
    expect(validateHeader('bulk_search', header, HEADER_OPTIONS)).toMatchObject({ ok: true });
    expect(rows).toEqual([['f1', 'Lobby still']]);
  });
});

describe('seed dashboards', () => {
  it('should define a shared security overview and a personal facility manager dashboard with valid widgets', () => {
    const [security, facility] = dashboards('fac-1');
    expect([security.is_shared, facility.is_shared]).toEqual([true, false]);
    expect(security.owner).not.toBe(facility.owner);
    for (const d of [security, facility]) {
      expect(new Set(d.widgets.map((x) => x.id)).size).toBe(d.widgets.length);
      for (const widget of d.widgets) expect(validWidget(widget), widget.id).toBe(true);
    }
  });
});
