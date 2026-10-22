/**
 * Weekly time windows as the data layer stores them (design §6.0):
 * `[{ days: number[] (1..7, ISO Monday = 1), from: 'HH:MM', to: 'HH:MM' }]`.
 * `from > to` crosses midnight (`22:00`–`06:00` starts on the listed day and
 * ends the next morning); `to` may be `24:00` (end of day). Pure functions, no React.
 */

export interface TimeWindow {
  readonly days: readonly number[];
  readonly from: string;
  readonly to: string;
}

/** Labels {@link formatWindows} writes; English by default. */
export interface WindowLabels {
  /** After a window that crosses midnight, in parentheses. */
  readonly overnight: string;
  /** Instead of the day list when a window covers all seven days. */
  readonly daily: string;
}

const ENGLISH: WindowLabels = { overnight: 'overnight', daily: 'Daily' };

/** A start time: `00:00`–`23:59`, two digits each (`itap.valid_windows`). */
export const FROM_TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/u;

/** An end time: a start time or `24:00`. */
export const isEndTime = (value: unknown): value is string =>
  typeof value === 'string' && (FROM_TIME.test(value) || value === '24:00');

export const isStartTime = (value: unknown): value is string =>
  typeof value === 'string' && FROM_TIME.test(value);

const WINDOW_KEYS = new Set(['days', 'from', 'to']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isDay = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7;

/** Whether a well-formed window ends on the next day. */
export const isOvernight = (window: Pick<TimeWindow, 'from' | 'to'>): boolean =>
  isStartTime(window.from) && isEndTime(window.to) && window.from > window.to;

function windowProblem(window: unknown): string | null {
  if (!isRecord(window)) return 'is not a window.';
  const unexpected = Object.keys(window).filter((key) => !WINDOW_KEYS.has(key));
  if (unexpected.length > 0) return `has unexpected keys (${unexpected.join(', ')}).`;
  const { days, from, to } = window;
  if (!Array.isArray(days)) return 'days must be a list of weekdays 1–7.';
  if (days.length === 0) return 'pick at least one day.';
  if (!days.every(isDay)) return 'days must be weekdays 1–7 (Monday = 1).';
  if (!isStartTime(from) || !isEndTime(to)) {
    return 'enter times as HH:MM, from 00:00 to 23:59 (24:00 only as the end).';
  }
  if (from === to) return 'start and end are the same; use 00:00–24:00 for a whole day.';
  return null;
}

/**
 * `null` when `value` is a valid window list (or empty: `null`/`undefined` is the
 * `required` rule's concern), else the first problem. Mirrors the database's
 * `itap.valid_windows` and also refuses equal ends, which `itap.in_windows` never matches.
 */
export function validateWindows(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return 'Time windows must be a list of windows.';
  for (const [index, window] of value.entries()) {
    const problem = windowProblem(window);
    if (problem !== null) return `Window ${index + 1}: ${problem}`;
  }
  return null;
}

/** Short weekday names in `locale`, ISO Monday first. */
export function weekdayNames(locale: string): readonly string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  // 2024-01-01 is a Monday: index 0 = ISO day 1.
  return [1, 2, 3, 4, 5, 6, 7].map((day) => format.format(new Date(Date.UTC(2024, 0, day))));
}

/** `[1,2,3,5,6]` → `Mon–Wed, Fri, Sat`: runs of three or more collapse into a range. */
function formatDays(
  days: readonly number[],
  names: readonly string[],
  labels: WindowLabels,
): string {
  const sorted = [...new Set(days.filter(isDay))].sort((a, b) => a - b);
  if (sorted.length === 7) return labels.daily;
  const parts: string[] = [];
  let start = 0;
  while (start < sorted.length) {
    let end = start;
    while (end + 1 < sorted.length && sorted[end + 1] === (sorted[end] ?? 0) + 1) end += 1;
    const name = (i: number) => names[(sorted[i] ?? 1) - 1] ?? '';
    if (end - start >= 2) parts.push(`${name(start)}–${name(end)}`);
    else for (let i = start; i <= end; i += 1) parts.push(name(i));
    start = end + 1;
  }
  return parts.join(', ');
}

/**
 * Compact text of a window list, for example
 * `Mon–Fri 08:00–18:00; Sat 22:00–06:00 (overnight)`. An empty or missing list is `''`;
 * malformed windows are skipped (the display flags them separately).
 */
export function formatWindows(
  windows: unknown,
  locale: string,
  labels: Partial<WindowLabels> = {},
): string {
  if (!Array.isArray(windows)) return '';
  const text = { ...ENGLISH, ...labels };
  const names = weekdayNames(locale);
  return windows
    .filter((w): w is TimeWindow => windowProblem(w) === null)
    .map((w) => {
      const hours = `${w.from}–${w.to}`;
      const overnight = isOvernight(w) ? ` (${text.overnight})` : '';
      return `${formatDays(w.days, names, text)} ${hours}${overnight}`;
    })
    .join('; ');
}
