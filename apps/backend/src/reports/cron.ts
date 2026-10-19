/**
 * Report schedule cron expressions: the 5-field subset validated by `itap.valid_cron` (minute hour day-of-month month
 * weekday; numbers, `*`, lists, ranges, steps; weekday 0-7 with 7 = Sunday; no names or `L`/`W`/`#`). As in Vixie
 * cron, when both day-of-month and weekday are restricted a day matching either runs. Wall-clock times are evaluated
 * in the schedule's IANA timezone.
 */

export class CronError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CronError';
  }
}

export type CronSchedule = {
  minutes: Set<number>;
  hours: Set<number>;
  days: Set<number>;
  months: Set<number>;
  weekdays: Set<number>;
  /** Day-of-month field is `*` (unrestricted). */
  anyDay: boolean;
  /** Weekday field is `*` (unrestricted). */
  anyWeekday: boolean;
};

const FIELDS: [min: number, max: number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
const PART = /^(\*|(\d{1,2})(?:-(\d{1,2}))?)(?:\/(\d{1,2}))?$/;

function parseField(field: string, [min, max]: [number, number]): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(',')) {
    const m = PART.exec(part);
    if (!m) throw new CronError(`Invalid cron field part: "${part}"`);
    const step = m[4] === undefined ? 1 : Number(m[4]);
    let from = min;
    let to = max;
    if (m[2] !== undefined) {
      from = Number(m[2]);
      // `n/step` runs from n to the end of the range; a plain `n` is just n.
      to = m[3] !== undefined ? Number(m[3]) : m[4] !== undefined ? max : from;
    }
    if (from < min || to > max || from > to || step < 1) throw new CronError(`Cron value out of range: "${part}"`);
    for (let v = from; v <= to; v += step) values.add(v);
  }
  return new Set([...values].sort((a, b) => a - b));
}

export function parseCron(expression: string): CronSchedule {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5 || fields[0] === '') throw new CronError('A cron expression has exactly 5 fields');
  const [minutes, hours, days, months, rawWeekdays] = fields.map((f, i) => parseField(f, FIELDS[i]));
  const weekdays = new Set([...rawWeekdays].map((d) => d % 7));
  return { minutes, hours, days, months, weekdays, anyDay: fields[2] === '*', anyWeekday: fields[4] === '*' };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      });
    } catch {
      throw new CronError(`Unknown timezone: ${timeZone}`);
    }
    formatters.set(timeZone, f);
  }
  return f;
}

/** Wall-clock fields of an instant in `timeZone`. */
function localParts(timeZone: string, ms: number): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(ms).map((p) => [p.type, p.value]));
  return {
    y: Number(parts.year),
    mo: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour),
    mi: Number(parts.minute),
    s: Number(parts.second),
  };
}

function offsetMs(timeZone: string, ms: number): number {
  const p = localParts(timeZone, ms);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/** UTC instant of a local wall-clock time (a time inside a DST gap maps to the shifted instant). */
function localToUtc(timeZone: string, y: number, mo: number, d: number, h: number, mi: number): number {
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const first = wall - offsetMs(timeZone, wall);
  return wall - offsetMs(timeZone, first);
}

/** Leap-day schedules recur at most every 4 years (8 across a skipped century leap year); bound the search. */
const SEARCH_DAYS = 366 * 8 + 1;

/** First run strictly after `after`, or null when the expression never matches (e.g. 30 February). */
export function nextRun(expression: string | CronSchedule, timeZone: string, after: Date): Date | null {
  const c = typeof expression === 'string' ? parseCron(expression) : expression;
  const afterMs = after.getTime();
  const start = localParts(timeZone, afterMs);
  for (let i = 0; i < SEARCH_DAYS; i += 1) {
    const date = new Date(Date.UTC(start.y, start.mo - 1, start.d + i));
    const [y, mo, d, wd] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCDay()];
    if (!c.months.has(mo)) continue;
    const dayOk = c.days.has(d);
    const weekdayOk = c.weekdays.has(wd);
    const matches = c.anyDay || c.anyWeekday ? dayOk && weekdayOk : dayOk || weekdayOk;
    if (!matches) continue;
    for (const h of c.hours) {
      for (const mi of c.minutes) {
        const t = localToUtc(timeZone, y, mo, d, h, mi);
        if (t > afterMs) return new Date(t);
      }
    }
  }
  return null;
}
