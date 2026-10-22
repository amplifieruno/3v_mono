import { tileOrder } from '../blocks/dashboard-grid/dashboard-layout';
import { GRID_COLUMNS, MAX_WIDGETS, type PositionAxis, widgetEntryName } from '../modules/analytics/dashboard-contract';
import {
  ANALYTIC_BLOCKS,
  type AnalyticBlockName,
  DASHBOARD_WIDGET_QUERIES,
  type DashboardWidgetKind,
} from '../modules/analytics/widget-blocks';

/**
 * A dashboard's `widgets` as the editor changes them (`itap.dashboard-widgets`): every change
 * returns the whole list, keeps what it does not touch as stored (an unreadable entry too, for the
 * validator to name) and never reorders the stored list except on a move.
 */

type Row = Readonly<Record<string, unknown>>;
type Position = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/** The kinds in the editor's order. */
export const WIDGET_KINDS = Object.keys(DASHBOARD_WIDGET_QUERIES) as DashboardWidgetKind[];

/** The stored list (anything but a list reads as none). */
export const widgetList = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

const asRow = (value: unknown): Row => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {});

const num = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/** A stored widget's position with every number read (a missing one as its smallest value). */
export function positionOf(widget: unknown): Position {
  const position = asRow(asRow(widget).position);
  return { x: num(position.x, 0), y: num(position.y, 0), w: num(position.w, 1), h: num(position.h, 1) };
}

/** The analytic blocks serving a kind, in the editor's order (each a "source" of the kind). */
export function entriesOf(kind: DashboardWidgetKind): AnalyticBlockName[] {
  return (Object.keys(ANALYTIC_BLOCKS) as AnalyticBlockName[]).filter((name) => ANALYTIC_BLOCKS[name].kind === kind);
}

/** The source a stored widget renders (`null` for a kind or query the contract refuses). */
export function entryOfWidget(widget: unknown): AnalyticBlockName | null {
  const { kind, query, params } = asRow(widget);
  if (typeof kind !== 'string' || !(WIDGET_KINDS as readonly string[]).includes(kind) || typeof query !== 'string') return null;
  return widgetEntryName(kind as DashboardWidgetKind, query, asRow(params));
}

/** The params a newly chosen source starts with: none (its block's defaults), or the key that tells it apart. */
function startingParams(entry: AnalyticBlockName): Row {
  return entry === 'deviceHealthChart' ? { device_id: null } : {};
}

/** A fresh id: `widget-<n>` with the smallest `n` no widget has. */
function freshId(list: readonly unknown[]): string {
  const ids = new Set(list.map((widget) => asRow(widget).id));
  let n = list.length + 1;
  while (ids.has(`widget-${n}`)) n += 1;
  return `widget-${n}`;
}

/** Whether another widget can be added (the contract holds 50). */
export const canAdd = (value: unknown): boolean => widgetList(value).length < MAX_WIDGETS;

/** The list with a new key-figures widget at the bottom, full width. */
export function addWidget(value: unknown, title: string): unknown[] {
  const list = widgetList(value);
  const bottom = list.reduce<number>((max, widget) => {
    const { y, h } = positionOf(widget);
    return Math.max(max, y + h);
  }, 0);
  const widget = { id: freshId(list), kind: 'kpi', title, query: 'dashboard_kpis', params: {}, position: { x: 0, y: Math.min(bottom, 1000), w: GRID_COLUMNS, h: 3 } };
  return [...list, widget];
}

/** The list without the widget at `index`. */
export const removeWidget = (value: unknown, index: number): unknown[] => widgetList(value).filter((_, at) => at !== index);

/** The list with the widget at `index` changed by `change` (an unreadable entry starts from nothing). */
function updateAt(value: unknown, index: number, change: (widget: Row) => Row): unknown[] {
  return widgetList(value).map((widget, at) => (at === index ? change(asRow(widget)) : widget));
}

export const setTitle = (value: unknown, index: number, title: string): unknown[] => updateAt(value, index, (w) => ({ ...w, title }));

/** A new kind takes its first source, with that source's starting params. */
export function setKind(value: unknown, index: number, kind: DashboardWidgetKind): unknown[] {
  const entry = entriesOf(kind)[0] as AnalyticBlockName;
  return updateAt(value, index, (w) => ({ ...w, kind, query: ANALYTIC_BLOCKS[entry].query, params: startingParams(entry) }));
}

/** A new source of the same kind: its query, and the params kept when the source is the same block's. */
export function setSource(value: unknown, index: number, entry: AnalyticBlockName): unknown[] {
  return updateAt(value, index, (w) => ({
    ...w,
    kind: ANALYTIC_BLOCKS[entry].kind,
    query: ANALYTIC_BLOCKS[entry].query,
    params: entryOfWidget(w) === entry ? w.params : startingParams(entry),
  }));
}

/** One position number (`null` for an emptied box, stored as is for the validator to name). */
export function setPosition(value: unknown, index: number, axis: PositionAxis, next: number | null): unknown[] {
  return updateAt(value, index, (w) => ({ ...w, position: { ...positionOf(w), ...asRow(w.position), [axis]: next } }));
}

/** One param: `undefined` removes the key (the block's default applies); a set value removes the keys it `replaces`. */
export function setParam(value: unknown, index: number, key: string, next: unknown, replaces: readonly string[] = []): unknown[] {
  return updateAt(value, index, (w) => {
    const params = { ...asRow(w.params) };
    if (next === undefined) delete params[key];
    else {
      params[key] = next;
      for (const replaced of replaces) delete params[replaced];
    }
    return { ...w, params };
  });
}

/**
 * Moves a widget one place earlier (`-1`) or later (`1`) in the dashboard's reading order: it trades
 * its row and column (`y`, `x`) with its neighbour there, each keeping its own size (a column is
 * pulled left when the size would pass the 12 columns), and the two trade places in the list.
 */
export function moveWidget(value: unknown, index: number, step: -1 | 1): unknown[] {
  const list = widgetList(value);
  const order = tileOrder(list.map((widget, at) => ({ index: at, position: positionOf(widget) })));
  const from = order.findIndex((tile) => tile.index === index);
  const other = order[from + step];
  if (from < 0 || other === undefined) return [...list];
  const a = positionOf(list[index]);
  const b = positionOf(list[other.index]);
  const place = (widget: unknown, to: Position, size: Position): Row => {
    const row = asRow(widget);
    return { ...row, position: { ...asRow(row.position), x: Math.min(to.x, GRID_COLUMNS - size.w), y: to.y } };
  };
  const next = [...list];
  // Each takes the other's place on the grid and in the list.
  next[index] = place(list[other.index], a, b);
  next[other.index] = place(list[index], b, a);
  return next;
}

/** The editor's rows in the dashboard's reading order: each stored index with its widget. */
export function rowsInOrder(value: unknown): { readonly index: number; readonly widget: unknown }[] {
  const list = widgetList(value);
  return tileOrder(list.map((widget, index) => ({ index, widget, position: positionOf(widget) })));
}
