/*
 * Calendar arithmetic in a facility's or an organization's time zone, with `Intl` only (no
 * library). The stats tables count days in the facility's zone (`facility_daily_stats.day`,
 * `area_transitions_daily.day`, the day buckets of `occupancy_series`) and hours in UTC
 * (`area_hourly_stats.hour`), so a chart cuts its window on the zone's midnights and labels hours
 * by the zone's clock, never the browser's. An unknown or missing zone reads as UTC.
 */

const HOUR_MS = 3_600_000;

/** The zone itself when `Intl` knows it, else `UTC`. */
export function knownZone(timeZone: string | null | undefined): string {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

/** The calendar day (`YYYY-MM-DD`) of an instant in a time zone. */
export function dayIn(at: Date, timeZone: string | null): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: knownZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** `day` moved by `offset` calendar days (pure date arithmetic, no time zone). */
export function addDays(day: string, offset: number): string {
  const [year = 1970, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + offset)).toISOString().slice(0, 10);
}

/** The day of the week of a calendar day, Monday first (0 = Monday … 6 = Sunday). */
export function weekdayOf(day: string): number {
  const [year = 1970, month = 1, date = 1] = day.split('-').map(Number);
  return (new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7;
}

/** The wall clock of an instant in a zone, as the UTC milliseconds of the same reading. */
function wallClockMs(at: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(at));
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
}

/** How far the zone's clock is ahead of UTC at an instant, in milliseconds. */
function offsetMs(at: number, zone: string): number {
  return wallClockMs(at, zone) - (at - (((at % 1000) + 1000) % 1000));
}

/**
 * The instant the zone's clock reads `hour`:00 on `day`. The offset is taken at a first guess and
 * checked at the answer, so a day on which the clocks change still lands on the zone's own hour.
 */
export function zonedTime(day: string, hour: number, timeZone: string | null): Date {
  const zone = knownZone(timeZone);
  const [year = 1970, month = 1, date = 1] = day.split('-').map(Number);
  const wall = Date.UTC(year, month - 1, date, hour);
  const first = wall - offsetMs(wall, zone);
  const second = wall - offsetMs(first, zone);
  return new Date(second);
}

/** The zone's midnight starting `day`. */
export function zonedMidnight(day: string, timeZone: string | null): Date {
  return zonedTime(day, 0, timeZone);
}

/** The hour of the day (0–23) the zone's clock reads at an instant. */
export function localHour(at: Date | string, timeZone: string | null): number {
  const ms = typeof at === 'string' ? Date.parse(at) : at.getTime();
  return new Date(wallClockMs(ms, knownZone(timeZone))).getUTCHours();
}

/** The start of the UTC hour after `at` (or `at` itself on the hour). */
export function nextHour(at: Date): Date {
  return new Date(Math.ceil(at.getTime() / HOUR_MS) * HOUR_MS);
}

/** A `YYYY-MM-DD` day as a short date ("22 Oct") in the console's locale; no time zone involved. */
export function shortDay(day: string): string {
  const [year = 1970, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** An instant as the zone's short date and time ("22 Oct, 14:00"). */
export function zonedDateTime(at: Date | string, timeZone: string | null): string {
  return new Date(at).toLocaleString(undefined, {
    timeZone: knownZone(timeZone),
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
