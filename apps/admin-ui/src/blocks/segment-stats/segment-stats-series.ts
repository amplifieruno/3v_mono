import { z } from 'zod';

/** How many days the segment trend shows, today included. */
export const SEGMENT_STATS_DAYS = 30;

/** One row of `segment_daily_stats` as the chart reads it. */
export const segmentStatRow = z.object({
  day: z.string(),
  member_count: z.number(),
  added: z.number(),
  removed: z.number(),
});

export type SegmentStatRow = z.infer<typeof segmentStatRow>;

/** One day of the chart: `null` figures for a day without a row (not yet evaluated, or before the segment existed). */
export const segmentStatPoint = z.object({
  day: z.string(),
  members: z.number().nullable(),
  added: z.number().nullable(),
  removed: z.number().nullable(),
});

export type SegmentStatPoint = z.infer<typeof segmentStatPoint>;

export const segmentStatSeries = z.object({ points: z.array(segmentStatPoint) });

export type SegmentStatSeries = z.infer<typeof segmentStatSeries>;

/** `YYYY-MM-DD` of a date in the browser's calendar. */
export function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The first day of the window ending on `today`. */
export function windowStart(today: Date, days: number = SEGMENT_STATS_DAYS): string {
  return isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1)));
}

/**
 * The rows of the window as one point per calendar day, oldest first, ending on `today`. The
 * stats are refreshed per day by the evaluation (`refresh_segment_daily_stats`); a day without a
 * row stays a gap rather than reading as zero members.
 */
export function dailyPoints(rows: readonly SegmentStatRow[], today: Date, days: number = SEGMENT_STATS_DAYS): SegmentStatSeries {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const points: SegmentStatPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset));
    const row = byDay.get(day);
    points.push({
      day,
      members: row?.member_count ?? null,
      added: row?.added ?? null,
      removed: row?.removed ?? null,
    });
  }
  return { points };
}
