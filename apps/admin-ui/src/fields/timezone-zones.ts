/**
 * IANA time zones as the browser knows them (`Intl`). The database accepts any zone
 * PostgreSQL knows (`itap.is_valid_timezone`); both read the IANA database, so a zone
 * the browser refuses is shown as unknown, never silently as UTC.
 */
import type { FieldProblem } from './field-issue';

export interface TimezoneOption {
  readonly zone: string;
  /** The zone's UTC offset at the given instant, `UTC+05:30`. */
  readonly offset: string;
}

/** `+03:00`, `-0500` and `Etc/GMT±N`: offsets, whose sign PostgreSQL reads the POSIX way. */
const OFFSET = /^(?:[+-]|Etc\/GMT[+-])/u;

/**
 * Whether `value` names a time zone the browser knows: `UTC`, a listed IANA zone
 * (`Europe/Moscow`), an alias of one (`Asia/Calcutta`, `US/Eastern`) or a legacy zone the
 * browser resolves without listing it (`EST`, `CET` in some ICU builds): a record that
 * already holds such a zone stays savable, and new picks come from the list
 * (`timezoneOptions`) anyway. Names the browser cannot resolve are refused, and so are
 * offsets (`+03:00`, `-0500`, `Etc/GMT+3`): PostgreSQL reads them with the POSIX sign,
 * the opposite of what they say.
 */
export function isTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '' || OFFSET.test(value.trim())) return false;
  let resolved: string;
  try {
    resolved = new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return false;
  }
  return !OFFSET.test(resolved);
}

/** `zone`'s offset from UTC at `at` (daylight saving included), `UTC+03:00`; `null` for an unknown zone. */
export function timezoneOffset(zone: string, at: Date = new Date()): string | null {
  if (!isTimezone(zone)) return null;
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')?.value;
  // `GMT+05:30`, or plain `GMT` at offset zero.
  const offset = name?.replace(/^GMT/u, '') ?? '';
  return `UTC${offset === '' ? '+00:00' : offset}`;
}

/** Every zone the browser lists, `UTC` first, each with its offset at `at`. */
export function timezoneOptions(at: Date = new Date()): readonly TimezoneOption[] {
  const zones = ['UTC', ...Intl.supportedValuesOf('timeZone').filter((zone) => zone !== 'UTC')];
  return zones.map((zone) => ({ zone, offset: timezoneOffset(zone, at) ?? '' }));
}

/** The validator's refusal of an unknown zone (code `timezone.unknown`). */
export const UNKNOWN_TIMEZONE: FieldProblem = {
  code: 'timezone.unknown',
  text: 'Not a known time zone. Pick one from the list (for example Europe/Moscow).',
};

/** `null` for a known zone or an empty value (the `required` rule's concern), else the refusal. */
export function checkTimezone(value: unknown): FieldProblem | null {
  if (value === null || value === undefined || value === '') return null;
  return isTimezone(value) ? null : UNKNOWN_TIMEZONE;
}
