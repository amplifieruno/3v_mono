import type { FieldProblem } from './field-issue';

/**
 * Report schedule crons as the data layer accepts them (`itap.valid_cron`, mirrored by the backend's
 * `apps/backend/src/reports/cron.ts`): five fields, minute hour day-of-month month weekday, each a
 * comma list of `*` or `n` or `n-m`, each optionally `/step` (step 1 or more); ranges ascending and
 * inside the field (weekday 0–7, 7 = Sunday). No names, no `?`, `L`, `W` or `#`. As in Vixie cron,
 * when both day-of-month and weekday are restricted a day matching either runs. Pure functions.
 */

export interface CronField {
  /** The values the field selects, ascending (weekday 7 folded into 0). */
  readonly values: readonly number[];
  /** The field starts with a star (a plain star, or a star with a step): unrestricted for the day-of-month / weekday rule. */
  readonly star: boolean;
  /** The step of a field that is only a star with a step of 2 or more (every n minutes), as written. */
  readonly step: number | null;
}

export interface Cron {
  readonly minute: CronField;
  readonly hour: CronField;
  readonly day: CronField;
  readonly month: CronField;
  readonly weekday: CronField;
}

const BOUNDS: readonly (readonly [number, number])[] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

/** One part of a field, the same pattern as the SQL (`[0-9]{1,2}`). */
const PART = /^(\*|([0-9]{1,2})(?:-([0-9]{1,2}))?)(?:\/([0-9]{1,2}))?$/u;

function parseField(text: string, [min, max]: readonly [number, number], weekday: boolean): CronField | null {
  const values = new Set<number>();
  for (const part of text.split(',')) {
    const match = PART.exec(part);
    if (match === null) return null;
    const step = match[4] === undefined ? 1 : Number(match[4]);
    if (step < 1) return null;
    let from = min;
    let to = max;
    if (match[2] !== undefined) {
      from = Number(match[2]);
      // `n/step` runs from n to the end of the field; a plain `n` is n alone (as the backend reads it).
      to = match[3] !== undefined ? Number(match[3]) : match[4] !== undefined ? max : from;
      const last = match[3] !== undefined ? Number(match[3]) : from;
      if (from < min || last > max || from > last) return null;
    }
    for (let v = from; v <= to; v += step) values.add(weekday ? v % 7 : v);
  }
  const single = /^\*\/([0-9]{1,2})$/u.exec(text);
  const stepOf = single === null ? null : Number(single[1]);
  return {
    values: [...values].sort((a, b) => a - b),
    star: text.startsWith('*'),
    step: stepOf !== null && stepOf >= 2 ? stepOf : null,
  };
}

/** The cron read field by field, or `null` when `itap.valid_cron` refuses it. */
export function parseCron(expression: unknown): Cron | null {
  if (typeof expression !== 'string') return null;
  const parts = expression.trim().split(/\s+/u);
  if (parts.length !== 5 || parts[0] === '') return null;
  const fields = parts.map((part, i) => parseField(part, BOUNDS[i] ?? [0, 0], i === 4));
  const [minute, hour, day, month, weekday] = fields;
  if (!minute || !hour || !day || !month || !weekday) return null;
  return { minute, hour, day, month, weekday };
}

/** The longest day of each month (February 29: a leap year comes). */
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * Whether a valid cron never runs: the days of the month it names exist in none of its months
 * (`0 7 30 2 *`) while the weekday does not widen it (a restricted weekday makes either day run).
 */
export function cronNeverRuns(cron: Cron): boolean {
  if (cron.day.star) return false;
  if (!cron.weekday.star) return false;
  return !cron.month.values.some((month) => cron.day.values.some((day) => day <= (MONTH_DAYS[month - 1] ?? 0)));
}

/** The summary's sentences and their English defaults (the bundle repeats them, `console.cron.*`). */
export const CRON_PHRASES = {
  everyMinute: 'Every minute',
  everyMinutes: 'Every {{step}} minutes',
  atMinutes: 'At minute {{minutes}} of every hour',
  atTimes: 'At {{times}}',
  duringHours: '{{minutes}}, during hours {{hours}}',
  everyDay: 'every day',
  onWeekdays: 'on {{days}}',
  onMonthDays: 'on day {{days}} of the month',
  onEither: 'on day {{days}} of the month or on {{weekdays}}',
  inMonths: 'in {{months}}',
  never: 'Never runs: none of its months has these days.',
} as const;

export type CronPhraseKey = keyof typeof CRON_PHRASES;
export type CronPhrase = (key: CronPhraseKey, params?: Readonly<Record<string, string>>) => string;

/** The English phrase with its params filled in. */
export const englishCronPhrase: CronPhrase = (key, params = {}) =>
  CRON_PHRASES[key].replace(/\{\{(\w+)\}\}/gu, (_, name: string) => params[name] ?? '');

/** `[1, 2, 3, 5]` as `1–3, 5` with `name` naming each value. */
export function compressList(values: readonly number[], name: (value: number) => string = String): string {
  const runs: string[] = [];
  let start = 0;
  for (let i = 1; i <= values.length; i += 1) {
    const prev = values[i - 1] ?? 0;
    if (i < values.length && values[i] === prev + 1) continue;
    const first = values[start] ?? 0;
    runs.push(prev - first >= 2 ? `${name(first)}–${name(prev)}` : prev === first ? name(first) : `${name(first)}, ${name(prev)}`);
    start = i;
  }
  return runs.join(', ');
}

const two = (value: number): string => String(value).padStart(2, '0');

/** Weekday (0 = Sunday) and month (1–12) names in `locale`, from `Intl`. */
function names(locale: string) {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  const month = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
  return {
    // 2023-01-01 was a Sunday.
    weekday: (day: number) => weekday.format(new Date(Date.UTC(2023, 0, 1 + day))),
    month: (value: number) => month.format(new Date(Date.UTC(2023, value - 1, 1))),
  };
}

/** At most this many times of day are listed one by one (`At 08:00, 12:00, 18:00`). */
const MAX_TIMES = 6;

function timePart(cron: Cron, phrase: CronPhrase): { readonly text: string; readonly daily: boolean } {
  const { minute, hour } = cron;
  if (minute.values.length * hour.values.length <= MAX_TIMES) {
    const times = hour.values.flatMap((h) => minute.values.map((m) => `${two(h)}:${two(m)}`));
    return { text: phrase('atTimes', { times: times.join(', ') }), daily: true };
  }
  const minutes =
    minute.values.length === 60
      ? phrase('everyMinute')
      : minute.step !== null
        ? phrase('everyMinutes', { step: String(minute.step) })
        : phrase('atMinutes', { minutes: compressList(minute.values, two) });
  if (hour.values.length === 24) return { text: minutes, daily: false };
  return { text: phrase('duringHours', { minutes, hours: compressList(hour.values, two) }), daily: false };
}

function dayPart(cron: Cron, phrase: CronPhrase, locale: string): string | null {
  const { day, weekday, month } = cron;
  const name = names(locale);
  const allDays = day.values.length === 31;
  const allWeekdays = weekday.values.length === 7;
  const days = compressList(day.values);
  const weekdays = compressList(weekday.values, name.weekday);
  let text: string | null;
  if (day.star || weekday.star) {
    // AND: a starred field is no restriction unless it steps (`*/2`).
    if (allDays && allWeekdays) text = null;
    else if (allDays) text = phrase('onWeekdays', { days: weekdays });
    else if (allWeekdays) text = phrase('onMonthDays', { days });
    else text = `${phrase('onMonthDays', { days })} ${phrase('onWeekdays', { days: weekdays })}`;
  } else {
    text = phrase('onEither', { days, weekdays });
  }
  const months = month.values.length === 12 ? null : phrase('inMonths', { months: compressList(month.values, name.month) });
  return [text, months].filter((part) => part !== null).join(' ') || null;
}

/**
 * A readable sentence for a valid cron (`At 07:00 on Monday`, `Every 15 minutes, during hours
 * 08–17`, `At 06:00 on day 1 of the month in January–March`), or `null` for one the database refuses.
 * `phrase` translates the parts; weekday and month names come from `Intl` in `locale`.
 */
export function cronSummary(expression: unknown, phrase: CronPhrase = englishCronPhrase, locale = 'en'): string | null {
  const cron = parseCron(expression);
  if (cron === null) return null;
  const time = timePart(cron, phrase);
  const days = dayPart(cron, phrase, locale);
  if (days === null) return time.daily ? `${time.text} ${phrase('everyDay')}` : time.text;
  return `${time.text} ${days}`;
}

/** The validator's refusal (code `cron.invalid`), with the database's grammar in words. */
export const INVALID_CRON: FieldProblem = {
  code: 'cron.invalid',
  text: 'Not a schedule the platform accepts: five fields (minute hour day month weekday), each *, a number, a range a-b or a list, optionally /step; for example 0 7 * * 1 (Mondays at 07:00).',
};

/** `null` for a valid cron or an empty value (the `required` rule's concern), else the refusal. */
export function checkCron(value: unknown): FieldProblem | null {
  if (value === null || value === undefined || value === '') return null;
  return parseCron(value) === null ? INVALID_CRON : null;
}
