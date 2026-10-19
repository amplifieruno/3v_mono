/**
 * Local-time helpers of the seed history (facility timezone, ISO weekdays) and the replay days: 04:00-to-04:00 local
 * days (nobody is on camera at 04:00, so a simulated day is a closed unit) covering at least 30 days before now and
 * ending one hour before now (the live crons own the last hour).
 */
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** Minutes after local midnight at which a replay day starts. */
export const DAY_BOUNDARY_MINUTES = 4 * 60;
/** The replay stops this long before now. */
export const REPLAY_END_OFFSET_MS = 3_600_000;
export const HISTORY_DAYS = 30;

export type ReplayDay = { date: string; start: number; end: number };

function parts(ms: number, timezone: string): Record<string, number> {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const out: Record<string, number> = {};
  for (const p of formatted) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return out;
}

/** Offset of the timezone from UTC at the instant, in ms (local = utc + offset). */
function offsetAt(ms: number, timezone: string): number {
  const p = parts(ms, timezone);
  const local = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return local - Math.floor(ms / 1000) * 1000;
}

/** Epoch ms of `minutes` after local midnight of the local date `date` (YYYY-MM-DD). */
export function zonedTime(date: string, minutes: number, timezone: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d) + minutes * MINUTE_MS;
  const first = guess - offsetAt(guess, timezone);
  return guess - offsetAt(first, timezone);
}

/** Local date (YYYY-MM-DD) of the instant. */
export function localDate(ms: number, timezone: string): string {
  const p = parts(ms, timezone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Minutes after local midnight of the instant. */
export function localMinutes(ms: number, timezone: string): number {
  const p = parts(ms, timezone);
  return p.hour * 60 + p.minute;
}

/** ISO weekday of a date: Monday 1 ... Sunday 7. */
export function weekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The replay days: the first starts at or before now - 30 days (moved back to Saturday when it would be a Sunday,
 * so the first day always has people on camera), the last ends at now - 1 hour.
 */
export function replayDays(now: Date, timezone: string): ReplayDay[] {
  const end = now.getTime() - REPLAY_END_OFFSET_MS;
  const from = now.getTime() - HISTORY_DAYS * DAY_MS;
  let date = localDate(from, timezone);
  if (zonedTime(date, DAY_BOUNDARY_MINUTES, timezone) > from) date = addDays(date, -1);
  if (weekday(date) === 7) date = addDays(date, -1);
  const days: ReplayDay[] = [];
  for (;;) {
    const start = zonedTime(date, DAY_BOUNDARY_MINUTES, timezone);
    if (start >= end) break;
    const next = addDays(date, 1);
    days.push({ date, start, end: Math.min(zonedTime(next, DAY_BOUNDARY_MINUTES, timezone), end) });
    date = next;
  }
  return days;
}
