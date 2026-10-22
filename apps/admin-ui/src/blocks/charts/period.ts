import { addDays, dayIn, nextHour, zonedMidnight } from './zoned-time';

/** How the occupancy series buckets its period. */
export const SERIES_BUCKETS = ['hour', 'day'] as const;
export type SeriesBucket = (typeof SERIES_BUCKETS)[number];

/** The longest period a block reads, in days (the stats queries refuse more than 731 days). */
export const MAX_PERIOD_DAYS = 366;

/** `occupancy_series` refuses more than 2000 hour buckets: periods longer than this are read by day. */
export const MAX_HOUR_BUCKET_DAYS = 83;

/** Up to this many days the series reads hours by default; longer periods read days. */
export const HOURLY_UP_TO_DAYS = 7;

/** The periods the Analytics page offers as tabs, the default first. */
export const ANALYTICS_PERIODS = [
  { key: '7d', days: 7, title: 'Last 7 days' },
  { key: '24h', days: 1, title: 'Last 24 hours' },
  { key: '30d', days: 30, title: 'Last 30 days' },
] as const;

export type AnalyticsPeriodKey = (typeof ANALYTICS_PERIODS)[number]['key'];

/** A `[from, to)` period as the stats queries take it. */
export interface PeriodBounds {
  readonly from: string;
  readonly to: string;
}

/** A period of whole days of a zone: its bounds and its days, oldest first. */
export interface DayWindow extends PeriodBounds {
  readonly days: readonly string[];
}

/** The bucket a series of `days` reads: the one asked for when it fits, hours for short periods, else days. */
export function seriesBucket(days: number, asked?: SeriesBucket | null): SeriesBucket {
  if (asked === 'day') return 'day';
  if (asked === 'hour') return days <= MAX_HOUR_BUCKET_DAYS ? 'hour' : 'day';
  return days <= HOURLY_UP_TO_DAYS ? 'hour' : 'day';
}

/**
 * The last `count` calendar days of the zone, today included, from the zone's midnight starting
 * the first to the one ending today: the days `occupancy_series` (by day) and `flow_matrix` count,
 * cut where the facility's clock turns, not the browser's.
 */
export function dayWindow(now: Date, timeZone: string | null, count: number): DayWindow {
  const today = dayIn(now, timeZone);
  const days = Array.from({ length: count }, (_, index) => addDays(today, index - count + 1));
  const first = days[0] ?? today;
  return {
    from: zonedMidnight(first, timeZone).toISOString(),
    to: zonedMidnight(addDays(today, 1), timeZone).toISOString(),
    days,
  };
}

/**
 * The last `days` × 24 UTC hours, ending at the hour boundary after `now` (the hour in progress
 * included), so the buckets stay put between reads within the hour.
 */
export function hourWindow(now: Date, days: number): PeriodBounds {
  const to = nextHour(now);
  return { from: new Date(to.getTime() - days * 24 * 3_600_000).toISOString(), to: to.toISOString() };
}
