import type { PlanAreaRow } from '../../fields/plan-rows';
import type { OccupancyRow } from './occupancy-query';

/** How full an area is: against its capacity, or just occupied or not without one. */
export type OccupancyLevel = 'empty' | 'occupied' | 'low' | 'medium' | 'high' | 'over';

/** Share of the capacity from which an area reads as filling up, then as nearly full. */
const MEDIUM_FROM = 0.5;
const HIGH_FROM = 0.9;

export function occupancyLevel(occupancy: number, capacity: number | null): OccupancyLevel {
  if (capacity !== null && occupancy > capacity) return 'over';
  if (occupancy <= 0) return 'empty';
  if (capacity === null || capacity <= 0) return 'occupied';
  const share = occupancy / capacity;
  return share >= HIGH_FROM ? 'high' : share >= MEDIUM_FROM ? 'medium' : 'low';
}

/** Shape fill and outline and legend swatch per level (class names must be literal). */
export const OCCUPANCY_LEVEL_CLASSES: Readonly<
  Record<OccupancyLevel, { readonly shape: string; readonly swatch: string }>
> = {
  empty: { shape: 'fill-slate-400/10 stroke-slate-400', swatch: 'bg-slate-300' },
  occupied: { shape: 'fill-sky-500/25 stroke-sky-600', swatch: 'bg-sky-500' },
  low: { shape: 'fill-emerald-500/25 stroke-emerald-600', swatch: 'bg-emerald-500' },
  medium: { shape: 'fill-amber-400/35 stroke-amber-600', swatch: 'bg-amber-400' },
  high: { shape: 'fill-orange-500/40 stroke-orange-600', swatch: 'bg-orange-500' },
  over: { shape: 'fill-red-500/45 stroke-red-700', swatch: 'bg-red-600' },
};

/** The levels in the legend's order. */
export const OCCUPANCY_LEVELS: readonly OccupancyLevel[] = ['empty', 'occupied', 'low', 'medium', 'high', 'over'];

/**
 * The plan's areas with the occupancy of `facility_occupancy_now` (people counted once per
 * person, sub-areas included), so the drawing, the legend and the area list show one figure.
 * An area the function did not return keeps no figure (0).
 */
export function withOccupancy(areas: readonly PlanAreaRow[], rows: readonly OccupancyRow[]): PlanAreaRow[] {
  const byArea = new Map(rows.flatMap((row) => (row.area_id === null ? [] : [[row.area_id, row] as const])));
  return areas.map((area) => {
    const row = byArea.get(area.id);
    return { ...area, current_occupancy: row?.occupancy ?? 0, capacity: row?.capacity ?? area.capacity };
  });
}

/** The facility's own row: everyone on site, each person once. */
export const facilityTotal = (rows: readonly OccupancyRow[]): number =>
  rows.find((row) => row.area_id === null)?.occupancy ?? 0;

export interface AreaOccupancyEntry {
  readonly row: OccupancyRow & { readonly area_id: string };
  readonly depth: number;
  readonly level: OccupancyLevel;
}

/**
 * The facility's areas as a tree in reading order (children under their parent, by name), each
 * with its depth and level; the facility row itself is left out.
 */
export function areaTree(rows: readonly OccupancyRow[]): AreaOccupancyEntry[] {
  const areas = rows.filter((row): row is OccupancyRow & { area_id: string } => row.area_id !== null);
  const ids = new Set(areas.map((row) => row.area_id));
  const children = new Map<string | null, (OccupancyRow & { area_id: string })[]>();
  for (const row of areas) {
    const parent = row.parent_id !== null && ids.has(row.parent_id) ? row.parent_id : null;
    children.set(parent, [...(children.get(parent) ?? []), row]);
  }
  const out: AreaOccupancyEntry[] = [];
  const visit = (parent: string | null, depth: number): void => {
    const level = [...(children.get(parent) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    for (const row of level) {
      out.push({ row, depth, level: occupancyLevel(row.occupancy, row.capacity) });
      visit(row.area_id, depth + 1);
    }
  };
  visit(null, 0);
  return out;
}
