import type { FieldProblem } from '../../fields/field-issue';
import {
  ANALYTIC_BLOCKS,
  type AnalyticBlockEntry,
  type AnalyticBlockName,
  DASHBOARD_WIDGET_QUERIES,
  type DashboardWidgetKind,
  analyticBlockProps,
} from './widget-blocks';

/**
 * The dashboard widget contract (`itap.valid_dashboard_widgets`, migrations `1792365700140` and
 * `1792365700144`) checked in the console with the same rules, so a widget the database would refuse
 * is named before saving: at most 50 widgets; each an object with exactly `id`, `kind`, `title`,
 * `query`, `params` and `position`; `id` 1..64 characters and unique; `kind` one of the kinds and
 * `query` one of its sources; `title` not blank, at most 200 characters; `params` an object;
 * `position` exactly the whole numbers `x` 0..11, `y` 0..1000, `w` 1..12, `h` 1..24 with
 * `x + w <= 12`. The database does not read `params`; the console does (`widgetSettings`).
 */

export const MAX_WIDGETS = 50;
export const MAX_WIDGET_ID = 64;
export const MAX_WIDGET_TITLE = 200;
export const GRID_COLUMNS = 12;
export const MAX_WIDGET_Y = 1000;
export const MAX_WIDGET_HEIGHT = 24;

const WIDGET_KEYS = ['id', 'kind', 'params', 'position', 'query', 'title'] as const;
const POSITION_KEYS = ['h', 'w', 'x', 'y'] as const;

/** Each position number's range (`itap.jsonb_int_between`). */
export const POSITION_RANGES = {
  x: { min: 0, max: GRID_COLUMNS - 1 },
  y: { min: 0, max: MAX_WIDGET_Y },
  w: { min: 1, max: GRID_COLUMNS },
  h: { min: 1, max: MAX_WIDGET_HEIGHT },
} as const;

export type PositionAxis = keyof typeof POSITION_RANGES;

/** A widget as the contract has it. */
export interface DashboardWidget {
  readonly id: string;
  readonly kind: DashboardWidgetKind;
  readonly title: string;
  readonly query: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly position: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
}

/** One refusal: the widget it names (`index` from 0; `null` for the whole list) and its text. */
export interface WidgetProblem extends FieldProblem {
  readonly index: number | null;
}

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const sameKeys = (value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean => {
  const own = Object.keys(value).sort();
  return own.length === keys.length && own.every((key, index) => key === keys[index]);
};

const isKind = (value: unknown): value is DashboardWidgetKind =>
  typeof value === 'string' && Object.hasOwn(DASHBOARD_WIDGET_QUERIES, value);

const intBetween = (value: unknown, min: number, max: number): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** Length in characters (code points), as the database counts. */
const chars = (value: string): number => [...value].length;

/** How a widget is named in a refusal: its title, else its id, else nothing. */
export function nameOf(value: unknown): string {
  const widget: { readonly title?: unknown; readonly id?: unknown } = isObject(value) ? value : {};
  if (typeof widget.title === 'string' && widget.title.trim() !== '') return widget.title.trim();
  return typeof widget.id === 'string' ? widget.id : '';
}

function problem(index: number | null, code: string, text: string, params: Record<string, string | number> = {}): WidgetProblem {
  const all: Record<string, string | number> = { position: index === null ? 0 : index + 1, ...params };
  const filled = text.replace(/\{\{(\w+)\}\}/gu, (_m, key: string) => String(all[key] ?? ''));
  return { index, code: `dashboardWidgets.${code}`, text: filled, params: all };
}

/** The refusals of one widget's position (none when it is fine). */
function positionProblems(index: number, position: unknown, name: string): WidgetProblem[] {
  if (!isObject(position) || !sameKeys(position, POSITION_KEYS))
    return [problem(index, 'positionKeys', 'Widget {{position}} “{{name}}”: its position needs exactly x, y, w and h.', { name })];
  const out: WidgetProblem[] = [];
  for (const axis of ['x', 'y', 'w', 'h'] as const) {
    const { min, max } = POSITION_RANGES[axis];
    if (!intBetween(position[axis], min, max))
      out.push(problem(index, 'positionRange', 'Widget {{position}} “{{name}}”: {{axis}} must be a whole number from {{min}} to {{max}}.', { name, axis, min, max }));
  }
  if (out.length === 0 && (position.x as number) + (position.w as number) > GRID_COLUMNS)
    out.push(
      problem(index, 'positionWidth', 'Widget {{position}} “{{name}}”: x + w must be at most 12 (it is {{x}} + {{w}}).', {
        name,
        x: position.x as number,
        w: position.w as number,
      }),
    );
  return out;
}

/** One widget's refusals under the contract. */
function widgetProblems(index: number, widget: unknown, seen: Map<string, number>): WidgetProblem[] {
  if (!isObject(widget)) return [problem(index, 'notWidget', 'Widget {{position}}: is not a widget.')];
  const name = nameOf(widget);
  if (!sameKeys(widget, WIDGET_KEYS))
    return [problem(index, 'keys', 'Widget {{position}} “{{name}}”: needs exactly the keys id, kind, title, query, params and position.', { name })];
  const out: WidgetProblem[] = [];
  const { id, kind, query, title, params, position } = widget;
  if (typeof id !== 'string' || chars(id) < 1 || chars(id) > MAX_WIDGET_ID)
    out.push(problem(index, 'id', 'Widget {{position}} “{{name}}”: give it an id of 1 to 64 characters.', { name }));
  else if (seen.has(id))
    out.push(problem(index, 'duplicateId', 'Widget {{position}} “{{name}}”: repeats the id “{{id}}” of widget {{first}}.', { name, id, first: (seen.get(id) ?? 0) + 1 }));
  else seen.set(id, index);
  if (!isKind(kind)) out.push(problem(index, 'kind', 'Widget {{position}} “{{name}}”: “{{kind}}” is not a widget kind.', { name, kind: String(kind) }));
  else if (typeof query !== 'string' || !(DASHBOARD_WIDGET_QUERIES[kind] as readonly string[]).includes(query))
    out.push(
      problem(index, 'query', 'Widget {{position}} “{{name}}”: a {{kind}} widget reads {{allowed}}, not “{{query}}”.', {
        name,
        kind,
        allowed: DASHBOARD_WIDGET_QUERIES[kind].join(' or '),
        query: String(query),
      }),
    );
  if (typeof title !== 'string' || /^ *$/u.test(title) || chars(title) > MAX_WIDGET_TITLE)
    out.push(problem(index, 'title', 'Widget {{position}}: give it a title of at most 200 characters, not only spaces.'));
  if (!isObject(params)) out.push(problem(index, 'params', 'Widget {{position}} “{{name}}”: its settings must be an object.', { name }));
  out.push(...positionProblems(index, position, name));
  return out;
}

/** Every refusal of a widget list under the database's contract, in widget order. */
export function contractProblems(widgets: unknown): WidgetProblem[] {
  if (!Array.isArray(widgets)) return [problem(null, 'notList', 'Widgets must be a list.')];
  if (widgets.length > MAX_WIDGETS)
    return [problem(null, 'tooMany', 'A dashboard holds at most {{max}} widgets; this one has {{count}}.', { max: MAX_WIDGETS, count: widgets.length })];
  const seen = new Map<string, number>();
  return widgets.flatMap((widget, index) => widgetProblems(index, widget, seen));
}

/** Whether a value is a widget the contract accepts on its own (its id's uniqueness aside). */
export function isContractWidget(widget: unknown): widget is DashboardWidget {
  return widgetProblems(0, widget, new Map()).length === 0;
}

/** The analytic block a widget renders: the entry of its kind and query (`when` tells two apart). */
export function widgetEntryName(kind: DashboardWidgetKind, query: string, params: Readonly<Record<string, unknown>>): AnalyticBlockName | null {
  const candidates = (Object.entries(ANALYTIC_BLOCKS) as [AnalyticBlockName, AnalyticBlockEntry][]).filter(
    ([, entry]) => entry.kind === kind && entry.query === query,
  );
  const chosen = candidates.find(([, entry]) => entry.when === undefined || entry.when(params));
  return chosen?.[0] ?? null;
}

/** A widget's settings as its block's props, or why they are refused. */
export type WidgetSettings =
  | { readonly ok: true; readonly entry: AnalyticBlockName; readonly props: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly reason: string };

/** Reads a contract widget's `params` as the props of the block it renders. */
export function widgetSettings(widget: DashboardWidget): WidgetSettings {
  const entry = widgetEntryName(widget.kind, widget.query, widget.params);
  if (entry === null) return { ok: false, reason: `no block reads ${widget.query} for a ${widget.kind} widget` };
  const read = analyticBlockProps(entry, widget.params);
  if (read.ok) return { ok: true, entry, props: read.props };
  return { ok: false, reason: read.issues.map((issue) => (issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`)).join('; ') };
}

/** The refusals of a widget list: the contract's, then each contract-valid widget's settings. */
export function dashboardProblems(widgets: unknown): WidgetProblem[] {
  const contract = contractProblems(widgets);
  if (!Array.isArray(widgets) || contract.some((p) => p.index === null)) return contract;
  const settings = widgets.flatMap((widget, index) => {
    if (contract.some((p) => p.index === index) || !isContractWidget(widget)) return [];
    const read = widgetSettings(widget);
    return read.ok
      ? []
      : [problem(index, 'settings', 'Widget {{position}} “{{name}}”: its settings are refused ({{reason}}).', { name: nameOf(widget), reason: read.reason })];
  });
  return [...contract, ...settings].sort((a, b) => (a.index ?? -1) - (b.index ?? -1));
}
