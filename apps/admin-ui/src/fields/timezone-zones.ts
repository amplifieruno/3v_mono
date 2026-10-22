/**
 * IANA time zones as the browser knows them (`Intl`). The database accepts any zone
 * PostgreSQL knows (`itap.is_valid_timezone`); both read the IANA database, so a zone
 * the browser refuses is shown as unknown, never silently as UTC.
 */

export interface TimezoneOption {
  readonly zone: string;
  /** The zone's UTC offset at the given instant, `UTC+05:30`. */
  readonly offset: string;
}

/** Whether `value` names a time zone the browser knows (`Europe/Moscow`, `UTC`). */
export function isTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
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

/** The validator's refusal of an unknown zone. */
export const UNKNOWN_TIMEZONE_MESSAGE =
  'Not a known time zone. Pick one from the list (for example Europe/Moscow).';

/** `null` for a known zone or an empty value (the `required` rule's concern), else the refusal. */
export function checkTimezone(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return isTimezone(value) ? null : UNKNOWN_TIMEZONE_MESSAGE;
}
