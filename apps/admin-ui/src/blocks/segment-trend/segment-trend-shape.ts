import { z } from 'zod';
import type { ChartPoint } from '../charts/line-chart';
import { addDays, dayIn, shortDay } from '../charts/zoned-time';

/** One row of `segment_daily_stats` with its segment's name. */
export const trendRow = z.object({
  segment_id: z.string(),
  day: z.string(),
  member_count: z.number(),
  segment: z.object({ name: z.string() }).nullable(),
});

export type TrendRow = z.infer<typeof trendRow>;

/** What the read answers: the organization's time zone (its calendar days) and the rows. */
export const trendRead = z.object({ timezone: z.string().nullable(), rows: z.array(trendRow) });

export type TrendRead = z.infer<typeof trendRead>;

/** One segment's line: its member count per organization day, oldest first. */
export interface SegmentTrend {
  readonly id: string;
  readonly name: string;
  readonly points: readonly ChartPoint[];
  readonly latest: number | null;
  readonly change: number;
}

/** The first day a read for the last `days` days asks for: a UTC date two days earlier, covering every zone. */
export function trendReadStart(now: Date, days: number): string {
  return addDays(dayIn(now, 'UTC'), -(days + 1));
}

/**
 * The rows as one line per segment over the organization's last `days` calendar days ending on
 * its day at `now` (a day without a row is a gap), the `limit` segments with the most members on
 * their latest recorded day first (ties by name). `change` is the latest count less the first.
 */
export function segmentTrends({ timezone, rows }: TrendRead, now: Date, days: number, limit: number): SegmentTrend[] {
  const today = dayIn(now, timezone);
  const period = Array.from({ length: days }, (_, index) => addDays(today, index - days + 1));
  const first = period[0] ?? today;
  const bySegment = new Map<string, { name: string; counts: Map<string, number> }>();
  for (const row of rows) {
    if (row.day < first || row.day > today) continue;
    const entry = bySegment.get(row.segment_id) ?? { name: row.segment?.name ?? row.segment_id, counts: new Map() };
    entry.counts.set(row.day, row.member_count);
    bySegment.set(row.segment_id, entry);
  }
  const trends = [...bySegment.entries()].map(([id, { name, counts }]): SegmentTrend => {
    const points = period.map((day) => ({ key: day, label: shortDay(day), value: counts.get(day) ?? null }));
    const present = points.map((point) => point.value).filter((value): value is number => value !== null);
    const latest = present[present.length - 1] ?? null;
    return { id, name, points, latest, change: latest === null ? 0 : latest - (present[0] ?? latest) };
  });
  return trends.sort((a, b) => (b.latest ?? 0) - (a.latest ?? 0) || a.name.localeCompare(b.name)).slice(0, limit);
}
