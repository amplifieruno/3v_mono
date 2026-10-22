const pad = (n: number): string => String(n).padStart(2, '0');

/** A stored instant (ISO text or `Date`) as the `datetime-local` input's local `YYYY-MM-DDTHH:mm`; `''` when empty or unreadable. */
export function toLocalInput(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const at = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(at.getTime())) return '';
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** The input's local `YYYY-MM-DDTHH:mm` as an ISO instant; `null` when cleared or unreadable. */
export function fromLocalInput(text: string): string | null {
  if (text === '') return null;
  const at = new Date(text);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** A stored instant's milliseconds (ISO text or `Date`), or `null` when empty or unreadable. */
export function instantOf(value: unknown): number | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value !== 'string' || value === '') return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
}

/** An instant as date and time of day in `locale` (`Oct 22, 2026, 09:05` in `en`), in the browser's time zone. */
export function formatDateTime(at: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
}
