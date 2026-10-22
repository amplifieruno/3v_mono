import { z } from 'zod';
import type { HeatAxis } from '../charts/heat-grid';
import { dayIn, localHour, weekdayOf } from '../charts/zoned-time';

/** One row of `area_hourly_stats` as the heatmap reads it. */
export const hourRow = z.object({ area_id: z.string().nullable(), hour: z.string(), dwell_seconds: z.number() });

export type HourRow = z.infer<typeof hourRow>;

/** What the read answers: the hourly rows of the period, the facility's area names, and whether the read was cut. */
export const heatRead = z.object({
  rows: z.array(hourRow),
  areas: z.array(z.object({ id: z.string(), name: z.string() })),
  truncated: z.boolean(),
});

export type HeatRead = z.infer<typeof heatRead>;

/** The heatmap: its rows, the 24 hours of the facility's day and the averages. */
export interface HeatData {
  readonly rows: readonly HeatAxis[];
  readonly columns: readonly HeatAxis[];
  readonly cells: readonly (readonly (number | null)[])[];
}

/** The 24 hours of the day as columns, every third one written ("00", "03", …). */
export function hourColumns(): HeatAxis[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const label = `${String(hour).padStart(2, '0')}:00`;
    return { key: String(hour), label, short: hour % 3 === 0 ? label.slice(0, 2) : '' };
  });
}

/** The days of the week, Monday first, in the console's locale. */
export function weekdayRows(): HeatAxis[] {
  // 1 January 2024 was a Monday.
  return Array.from({ length: 7 }, (_, index) => ({
    key: String(index),
    label: new Date(Date.UTC(2024, 0, 1 + index)).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }),
  }));
}

/** Presence seconds summed per key and hour of the facility's day. */
function sumByHour(rows: readonly HourRow[], keyOf: (row: HourRow) => string, timeZone: string | null): Map<string, number[]> {
  const sums = new Map<string, number[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const hours = sums.get(key) ?? Array.from({ length: 24 }, () => 0);
    const hour = localHour(row.hour, timeZone);
    hours[hour] = (hours[hour] ?? 0) + row.dwell_seconds;
    sums.set(key, hours);
  }
  return sums;
}

/**
 * The average people present per hour of the facility's day for each area (the `limit` with the
 * most presence, ties by name): an area's presence seconds in that clock hour over the period,
 * divided by an hour and by the period's days. The facility total rows (no area) are left out.
 */
export function heatByArea(read: HeatRead, days: readonly string[], timeZone: string | null, limit: number, unknownArea: string): HeatData {
  const names = new Map(read.areas.map((area) => [area.id, area.name]));
  const sums = sumByHour(read.rows.filter((row) => row.area_id !== null), (row) => row.area_id ?? '', timeZone);
  const total = (hours: readonly number[]) => hours.reduce((sum, value) => sum + value, 0);
  const nameOf = (id: string) => names.get(id) ?? unknownArea;
  const chosen = [...sums.entries()]
    .filter(([, hours]) => total(hours) > 0)
    .sort(([a, x], [b, y]) => total(y) - total(x) || nameOf(a).localeCompare(nameOf(b)))
    .slice(0, limit);
  const perHour = 3600 * Math.max(days.length, 1);
  return {
    rows: chosen.map(([id]) => ({ key: id, label: nameOf(id) })),
    columns: hourColumns(),
    cells: chosen.map(([, hours]) => hours.map((seconds) => seconds / perHour)),
  };
}

/**
 * The average people present in the whole facility per day of the week and hour of its day: the
 * facility total rows (no area), each folded on the facility's weekday and clock hour, divided by
 * an hour and by how many of that weekday the period holds (`null` for a weekday it does not hold).
 */
export function heatByWeekday(read: HeatRead, days: readonly string[], timeZone: string | null): HeatData {
  const sums = sumByHour(
    read.rows.filter((row) => row.area_id === null),
    (row) => String(weekdayOf(dayIn(new Date(row.hour), timeZone))),
    timeZone,
  );
  const counts = Array.from({ length: 7 }, (_, weekday) => days.filter((day) => weekdayOf(day) === weekday).length);
  const rows = weekdayRows();
  return {
    rows,
    columns: hourColumns(),
    cells: rows.map((row, weekday) => {
      const count = counts[weekday] ?? 0;
      const hours = sums.get(row.key) ?? Array.from({ length: 24 }, () => 0);
      return hours.map((seconds) => (count === 0 ? null : seconds / (3600 * count)));
    }),
  };
}

/** The facility's hourly series as heatmap rows (facility totals, no area), for a heatmap read from `occupancy_series`. */
export function seriesHours(rows: readonly { bucket_start: string; dwell_seconds: number }[]): HeatRead {
  return {
    rows: rows.map((row) => ({ area_id: null, hour: row.bucket_start, dwell_seconds: row.dwell_seconds })),
    areas: [],
    truncated: false,
  };
}

/** The busiest cell of a heatmap, or `null` when every cell is empty. */
export function busiestCell(heat: HeatData): { row: string; column: string; value: number } | null {
  let best: { row: string; column: string; value: number } | null = null;
  heat.cells.forEach((line, rowIndex) =>
    line.forEach((value, columnIndex) => {
      if (value !== null && value > 0 && (best === null || value > best.value)) {
        best = { row: heat.rows[rowIndex]?.label ?? '', column: heat.columns[columnIndex]?.label ?? '', value };
      }
    }),
  );
  return best;
}
