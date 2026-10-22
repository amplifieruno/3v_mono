/**
 * A page title for a record named by when it happened (`Merge of 20/10/2026, 20:33`): the
 * records of merges, duplicate pairs and verification requests have no name of their own. `null`
 * (the framework's own title) when the time is missing or unreadable.
 */
export function recordDate(prefix: string, value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime())
    ? null
    : `${prefix} ${at.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
}
