/** The block's `t`, as its view receives it. */
export type SegmentStatsT = (key: string, options?: { readonly params?: Record<string, unknown> }) => string;

/** The drawing's own units; the SVG stretches to its box (strokes keep their width). */
export const CHART_WIDTH = 480;
export const CHART_HEIGHT = 64;

/** A `YYYY-MM-DD` day as a short date in the console's locale. */
export function shortDay(day: string): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** The runs of consecutive days that have a value: a gap breaks the line. */
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
