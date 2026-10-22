import { z } from 'zod';
import type { HeatAxis } from '../charts/heat-grid';

/** One pair of `flow_matrix` (`itap_results.flow_matrix_rows`). */
export const flowRow = z.object({ from_area_id: z.string(), to_area_id: z.string(), count: z.number() });

export type FlowRow = z.infer<typeof flowRow>;

/** An area's id and name, to label the matrix. */
export const areaName = z.object({ id: z.string(), name: z.string() });

/** What the read answers: the pairs, most frequent first, and the facility's areas. */
export const flowRead = z.object({ rows: z.array(flowRow), areas: z.array(areaName) });

export type FlowRead = z.infer<typeof flowRead>;

/** A move between two named areas. */
export interface FlowMove {
  readonly from: string;
  readonly to: string;
  readonly count: number;
}

/** The matrix: the busiest areas (rows and columns alike), the counts, the total and the moves left out. */
export interface FlowGrid {
  readonly areas: readonly HeatAxis[];
  readonly cells: readonly (readonly number[])[];
  readonly total: number;
  readonly hidden: number;
  readonly top: readonly FlowMove[];
}

/**
 * The pairs as a square matrix over the `limit` areas with the most moves in or out (ties by
 * name), so the busiest corridors stay visible on a large facility; moves touching another area
 * are counted in `hidden`. `top` holds the `topCount` most frequent moves, named.
 */
export function flowGrid(read: FlowRead, limit: number, unknownArea: string, topCount = 5): FlowGrid {
  const names = new Map(read.areas.map((area) => [area.id, area.name]));
  const nameOf = (id: string) => names.get(id) ?? unknownArea;
  const traffic = new Map<string, number>();
  for (const row of read.rows) {
    traffic.set(row.from_area_id, (traffic.get(row.from_area_id) ?? 0) + row.count);
    traffic.set(row.to_area_id, (traffic.get(row.to_area_id) ?? 0) + row.count);
  }
  const chosen = [...traffic.entries()]
    .sort(([a, x], [b, y]) => y - x || nameOf(a).localeCompare(nameOf(b)))
    .slice(0, limit)
    .map(([id]) => id);
  const index = new Map(chosen.map((id, position) => [id, position]));
  const cells = chosen.map(() => chosen.map(() => 0));
  let total = 0;
  let shown = 0;
  for (const row of read.rows) {
    total += row.count;
    const from = index.get(row.from_area_id);
    const to = index.get(row.to_area_id);
    if (from === undefined || to === undefined) continue;
    const line = cells[from];
    if (line !== undefined) line[to] = (line[to] ?? 0) + row.count;
    shown += row.count;
  }
  const top = [...read.rows]
    .sort((a, b) => b.count - a.count)
    .slice(0, topCount)
    .map((row) => ({ from: nameOf(row.from_area_id), to: nameOf(row.to_area_id), count: row.count }));
  return { areas: chosen.map((id) => ({ key: id, label: nameOf(id) })), cells, total, hidden: total - shown, top };
}
