import { z } from 'zod';
import type { ChartPoint } from '../charts/line-chart';
import type { SeriesBucket } from '../charts/period';
import { dayIn, shortDay, zonedDateTime } from '../charts/zoned-time';

/** One bucket of `occupancy_series` (`itap_results.occupancy_series_rows`) as the chart reads it. */
export const seriesRow = z.object({
  bucket_start: z.string(),
  day: z.string().nullable(),
  unique_identities: z.number(),
  entries: z.number(),
  exits: z.number(),
  dwell_seconds: z.number(),
  avg_dwell_seconds: z.number().nullable(),
  peak_occupancy: z.number(),
});

export type SeriesRow = z.infer<typeof seriesRow>;

/** One bucket of the chart: its label in the facility's calendar or clock and its figures. */
export interface SeriesPoint {
  readonly key: string;
  readonly label: string;
  readonly people: number;
  readonly peak: number;
  readonly entries: number;
  readonly exits: number;
}

/**
 * The rows as chart points, oldest first. A day bucket is named by its `day` (the facility's
 * calendar day, as the server cut it), never by its start instant read in the browser's zone; an
 * hour bucket by the facility's clock.
 */
export function seriesPoints(rows: readonly SeriesRow[], bucket: SeriesBucket, timeZone: string | null): SeriesPoint[] {
  return rows.map((row) => ({
    key: row.bucket_start,
    label:
      bucket === 'day'
        ? shortDay(row.day ?? dayIn(new Date(row.bucket_start), timeZone))
        : zonedDateTime(row.bucket_start, timeZone),
    people: row.unique_identities,
    peak: row.peak_occupancy,
    entries: row.entries,
    exits: row.exits,
  }));
}

/** The people present per bucket, for the line chart. */
export function peopleLine(points: readonly SeriesPoint[]): ChartPoint[] {
  return points.map((point) => ({ key: point.key, label: point.label, value: point.people }));
}

/** The period's totals: entries, exits and the highest occupancy with the first bucket it was reached in. */
export function seriesTotals(points: readonly SeriesPoint[]): {
  entries: number;
  exits: number;
  peak: number;
  peakAt: string | null;
} {
  let peak = 0;
  let peakAt: string | null = null;
  for (const point of points) {
    if (point.peak > peak) {
      peak = point.peak;
      peakAt = point.label;
    }
  }
  return {
    entries: points.reduce((sum, point) => sum + point.entries, 0),
    exits: points.reduce((sum, point) => sum + point.exits, 0),
    peak,
    peakAt,
  };
}
