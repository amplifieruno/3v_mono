import { z } from 'zod';

/** How many days the segment trend shows, today included. */
export const SEGMENT_STATS_DAYS = 30;

/**
 * How many days back the read reaches from the browser's date: the window plus a margin, so the
 * organization's 30 days are covered whatever the two time zones (at most a day apart).
 */
export const SEGMENT_STATS_READ_DAYS = SEGMENT_STATS_DAYS + 2;

/** One row of `segment_daily_stats` as the chart reads it. */
export const segmentStatRow = z.object({
  day: z.string(),
  member_count: z.number(),
  added: z.number(),
  removed: z.number(),
});

export type SegmentStatRow = z.infer<typeof segmentStatRow>;

/** What the read answers: the organization's time zone and the rows from the read's first day. */
export const segmentStatRows = z.object({
  timezone: z.string().nullable(),
  rows: z.array(segmentStatRow),
});

export type SegmentStatRows = z.infer<typeof segmentStatRows>;

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

/**
 * The calendar day (`YYYY-MM-DD`) of an instant in a time zone: the organization's for its daily
 * figures (`segment_daily_stats.day` is the organization-local day, `refresh_segment_daily_stats`).
 * An unknown or missing zone falls back to UTC.
 */
export function dayIn(at: Date, timeZone: string | null): string {
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  try {
    return format(timeZone ?? 'UTC');
  } catch {
    return format('UTC');
  }
}

/** `day` moved by `offset` calendar days (pure date arithmetic, no time zone). */
export function addDays(day: string, offset: number): string {
  const [year = 1970, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + offset)).toISOString().slice(0, 10);
}

/** The first day the read asks for: the browser's date, far enough back for any organization zone. */
export function readStart(now: Date): string {
  return addDays(dayIn(now, 'UTC'), -SEGMENT_STATS_READ_DAYS);
}

/**
 * The rows as one point per calendar day of the organization, oldest first, ending on the
 * organization's day at `now`. The stats are refreshed per day by the evaluation; a day without a
 * row stays a gap rather than reading as zero members.
 */
export function dailyPoints(
  { timezone, rows }: SegmentStatRows,
  now: Date,
  days: number = SEGMENT_STATS_DAYS,
): SegmentStatSeries {
  const today = dayIn(now, timezone);
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const points: SegmentStatPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = addDays(today, -offset);
    const row = byDay.get(day);
    points.push({ day, members: row?.member_count ?? null, added: row?.added ?? null, removed: row?.removed ?? null });
  }
  return { points };
}
