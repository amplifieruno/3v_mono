/** The block's `t`, as its view receives it. */
export type ChartT = (key: string, options?: { readonly params?: Record<string, unknown> }) => string;

/** The drawing's own units for the line and bar charts; the SVG stretches to its box (strokes keep their width). */
export const CHART_WIDTH = 480;
export const CHART_HEIGHT = 64;

/** The top of a chart's scale: a tenth above the largest value, 1 when there is none (never 0). */
export function scaleMax(values: readonly (number | null)[]): number {
  const present = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return Math.max(...present, 0) * 1.1 || 1;
}

/** The runs of consecutive points that have a value: a gap breaks the line. */
export function runsOf(values: readonly (number | null)[]): { start: number; values: number[] }[] {
  const runs: { start: number; values: number[] }[] = [];
  values.forEach((value, index) => {
    if (value === null) return;
    const last = runs[runs.length - 1];
    if (last !== undefined && last.start + last.values.length === index) last.values.push(value);
    else runs.push({ start: index, values: [value] });
  });
  return runs;
}

/** How many shades a heat cell takes besides "nothing". */
export const HEAT_LEVELS = 5;

/** Cell classes by level, 0 = nothing (class names must be literal for Tailwind). */
export const HEAT_CLASSES = [
  'fill-muted',
  'fill-primary/15',
  'fill-primary/30',
  'fill-primary/50',
  'fill-primary/70',
  'fill-primary/90',
] as const;

/** The shade of a value against the grid's largest: 0 for nothing, else 1..HEAT_LEVELS. */
export function heatLevel(value: number | null, max: number): number {
  if (value === null || value <= 0 || max <= 0) return 0;
  return Math.min(HEAT_LEVELS, Math.max(1, Math.ceil((value / max) * HEAT_LEVELS)));
}

/** A label cut to `max` characters with an ellipsis (the full text goes in the hover title). */
export function clip(label: string, max: number): string {
  return label.length <= max ? label : `${label.slice(0, Math.max(max - 1, 1))}…`;
}

/** A count or average for reading: whole numbers as they are, others to one decimal. */
export function formatFigure(value: number): string {
  return Number.isInteger(value) ? String(value) : (Math.round(value * 10) / 10).toFixed(1);
}

/** Seconds as "4 min" (under a minute "12 s", an hour or more "2 h 5 min"). */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

/** A stored value read as words ("connection_error" → "Connection error"), for hover titles. */
export function humanize(value: string): string {
  const words = value.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A chart's accessible name from its data: what it shows, the period it spans and its summary figures. */
export function chartLabel(what: string, start?: string, end?: string, summary?: string): string {
  const span = start && end ? ` (${start} – ${end})` : '';
  return `${what}${span}${summary ? `: ${summary}` : ''}`;
}
