import { describe, expect, it } from 'vitest';
import { GRID_CLASSES, tileClasses, tileOrder } from '../../src/blocks/dashboard-grid/dashboard-layout';
import {
  addWidget,
  moveWidget,
  removeWidget,
  rowsInOrder,
  setKind,
  setParam,
  setPosition,
  setSource,
} from '../../src/fields/dashboard-widgets-format';
import { contractProblems } from '../../src/modules/analytics/dashboard-contract';

/** The dashboard's 12-column grid (tile classes, reading order) and the editor's changes to the widget list. */

const at = (index: number, x: number, y: number, w = 4, h = 2) => ({ index, position: { x, y, w, h } });

const widget = (id: string, x: number, y: number, w: number, h = 2) => ({
  id,
  kind: 'kpi',
  title: id,
  query: 'dashboard_kpis',
  params: {},
  position: { x, y, w, h },
});

describe('dashboard grid layout', () => {
  it('should place a tile at its column with its width and height from the md width up', () => {
    expect(tileClasses({ x: 0, y: 0, w: 12, h: 2 })).toBe('md:col-start-1 md:col-span-12 md:row-span-2');
    expect(tileClasses({ x: 7, y: 2, w: 5, h: 24 })).toBe('md:col-start-8 md:col-span-5 md:row-span-24');
    expect(tileClasses({ x: 11, y: 0, w: 1, h: 1 })).toBe('md:col-start-12 md:col-span-1 md:row-span-1');
  });

  it('should clamp numbers the contract refuses rather than draw past the grid', () => {
    expect(tileClasses({ x: 8, y: 0, w: 6, h: 30 })).toBe('md:col-start-9 md:col-span-4 md:row-span-24');
    expect(tileClasses({ x: -1, y: 0, w: 0, h: 0 })).toBe('md:col-start-1 md:col-span-1 md:row-span-1');
  });

  it('should stack on narrow screens and lay twelve columns of 5rem rows from md up', () => {
    expect(GRID_CLASSES).toBe('grid grid-cols-1 gap-4 md:grid-cols-12 md:auto-rows-[5rem]');
  });

  it('should order tiles by row, then column, then their place in the list', () => {
    const tiles = [at(0, 6, 7), at(1, 0, 7), at(2, 7, 2), at(3, 0, 0, 12), at(4, 0, 2), at(5, 0, 2)];
    expect(tileOrder(tiles).map((tile) => tile.index)).toEqual([3, 4, 5, 2, 1, 0]);
  });
});

describe('dashboard editor changes', () => {
  it('should add a full-width key-figures widget under the others with a fresh id', () => {
    const list = addWidget([widget('widget-2', 0, 0, 12, 3)], 'New widget');
    expect(list[1]).toEqual({
      id: 'widget-3',
      kind: 'kpi',
      title: 'New widget',
      query: 'dashboard_kpis',
      params: {},
      position: { x: 0, y: 3, w: 12, h: 3 },
    });
    expect(contractProblems(list)).toEqual([]);
    expect(addWidget(null, 'First')).toHaveLength(1);
  });

  it('should remove a widget and keep the others as stored', () => {
    const list = [widget('a', 0, 0, 6), 'unreadable', widget('c', 6, 0, 6)];
    expect(removeWidget(list, 0)).toEqual(['unreadable', widget('c', 6, 0, 6)]);
  });

  it('should move a widget earlier by trading its row and column with its neighbour, each keeping its size', () => {
    const list = [widget('a', 0, 0, 8, 4), widget('b', 8, 0, 4, 2), widget('c', 0, 4, 12)];
    const moved = moveWidget(list, 1, -1);
    expect(rowsInOrder(moved).map(({ widget: w }) => (w as { id: string }).id)).toEqual(['b', 'a', 'c']);
    expect(moved).toEqual([widget('b', 0, 0, 4, 2), widget('a', 4, 0, 8, 4), widget('c', 0, 4, 12)]);
    expect(contractProblems(moved)).toEqual([]);
    expect(moveWidget(list, 0, -1)).toEqual(list);
    expect(moveWidget(list, 2, 1)).toEqual(list);
  });

  it('should start a new kind on its first source and keep the settings only for the same source', () => {
    const list = [{ ...widget('a', 0, 0, 12), kind: 'heatmap', query: 'area_hourly_stats', params: { days: 7 } }];
    expect(setKind(list, 0, 'device_health')[0]).toMatchObject({ kind: 'device_health', query: 'devices', params: {} });
    expect(setSource(list, 0, 'heatmap')[0]).toMatchObject({ query: 'area_hourly_stats', params: { days: 7 } });
    expect(setSource(list, 0, 'heatmapSeries')[0]).toMatchObject({ query: 'occupancy_series', params: {} });
    // The one-device chart names its device key, so it is told apart from every device's table.
    expect(setSource([{ ...widget('d', 0, 0, 12), kind: 'device_health', query: 'devices' }], 0, 'deviceHealthChart')[0]).toMatchObject({
      query: 'device_health_metrics',
      params: { device_id: null },
    });
  });

  it('should set and clear a setting and keep an emptied position box for the validator', () => {
    const list = [widget('a', 0, 0, 12)];
    expect(setParam(setParam(list, 0, 'details', false), 0, 'details', undefined)[0]).toMatchObject({ params: {} });
    expect(setParam(list, 0, 'details', false)[0]).toMatchObject({ params: { details: false } });
    // A deliveries period replaces the seed's days.
    const deliveries = [{ ...widget('d', 0, 0, 12), kind: 'deliveries', query: 'delivery_report', params: { days: 7 } }];
    expect(setParam(deliveries, 0, 'period', '30d', ['days'])[0]).toMatchObject({ params: { period: '30d' } });
    expect((setParam(deliveries, 0, 'period', '30d', ['days'])[0] as { params: object }).params).toEqual({ period: '30d' });
    const emptied = setPosition(list, 0, 'w', null);
    expect(emptied[0]).toMatchObject({ position: { x: 0, y: 0, w: null, h: 2 } });
    expect(contractProblems(emptied).map((problem) => problem.code)).toEqual(['dashboardWidgets.positionRange']);
  });
});
