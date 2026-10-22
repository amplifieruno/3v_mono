import type { DashboardWidget } from '../../modules/analytics/dashboard-contract';

/*
 * The dashboard's 12-column grid (`itap:dashboard-grid`). Tailwind builds only the class names it
 * finds written out, so every start and span is listed here literally. From the `md` width up a
 * tile starts at its column (`x`), spans `w` columns and `h` rows of 5rem; the rows are filled
 * top to bottom in the widgets' order (`y`, then `x`), each tile in the first row from the cursor
 * where its columns are free (CSS grid auto-placement), so the vertical gaps a layout leaves close
 * up and overlapping widgets stack instead of covering each other. Narrower, tiles stack in that
 * order, each as tall as its content.
 */

const COLUMN_START = [
  'md:col-start-1', 'md:col-start-2', 'md:col-start-3', 'md:col-start-4', 'md:col-start-5', 'md:col-start-6',
  'md:col-start-7', 'md:col-start-8', 'md:col-start-9', 'md:col-start-10', 'md:col-start-11', 'md:col-start-12',
] as const;

const COLUMN_SPAN = [
  'md:col-span-1', 'md:col-span-2', 'md:col-span-3', 'md:col-span-4', 'md:col-span-5', 'md:col-span-6',
  'md:col-span-7', 'md:col-span-8', 'md:col-span-9', 'md:col-span-10', 'md:col-span-11', 'md:col-span-12',
] as const;

const ROW_SPAN = [
  'md:row-span-1', 'md:row-span-2', 'md:row-span-3', 'md:row-span-4', 'md:row-span-5', 'md:row-span-6',
  'md:row-span-7', 'md:row-span-8', 'md:row-span-9', 'md:row-span-10', 'md:row-span-11', 'md:row-span-12',
  'md:row-span-13', 'md:row-span-14', 'md:row-span-15', 'md:row-span-16', 'md:row-span-17', 'md:row-span-18',
  'md:row-span-19', 'md:row-span-20', 'md:row-span-21', 'md:row-span-22', 'md:row-span-23', 'md:row-span-24',
] as const;

/** The grid itself: one column when narrow, twelve with rows of 5rem from `md` up. */
export const GRID_CLASSES = 'grid grid-cols-1 gap-4 md:grid-cols-12 md:auto-rows-[5rem]';

const pick = (list: readonly string[], index: number): string => list[Math.min(Math.max(index, 0), list.length - 1)] ?? '';

/** A tile's placement classes from its position (out-of-range numbers are clamped; the contract refuses them anyway). */
export function tileClasses(position: DashboardWidget['position']): string {
  const x = Math.min(Math.max(position.x, 0), COLUMN_START.length - 1);
  const w = Math.min(Math.max(position.w, 1), COLUMN_START.length - x);
  return [pick(COLUMN_START, x), pick(COLUMN_SPAN, w - 1), pick(ROW_SPAN, position.h - 1)].join(' ');
}

/** Something laid out on the grid: a position, and its place in the stored list for ties and keys. */
export interface Placed {
  readonly index: number;
  readonly position: DashboardWidget['position'];
}

/** The reading order of the tiles: by row (`y`), then column (`x`), then the stored order. */
export function tileOrder<T extends Placed>(tiles: readonly T[]): T[] {
  return [...tiles].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x || a.index - b.index);
}
