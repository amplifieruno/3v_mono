/** What the conditions editor's boxes type, as stored values, and back. */

const pad = (n: number): string => String(n).padStart(2, '0');

/** A stored timestamp as the `datetime-local` box shows it (the viewer's zone), or `''`. */
export function localInputOf(value: unknown): string {
  if (typeof value !== 'string') return '';
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return '';
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** What the `datetime-local` box typed, as an ISO instant; empty = nothing. */
export function instantOf(local: string): string | null {
  if (local === '') return null;
  const at = new Date(local);
  return Number.isNaN(at.getTime()) ? local : at.toISOString();
}

/** What a number box typed: a number, `null` when empty, the text as typed when it is no number (flagged). */
export function numberOf(text: string): number | string | null {
  if (text.trim() === '') return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : text;
}
