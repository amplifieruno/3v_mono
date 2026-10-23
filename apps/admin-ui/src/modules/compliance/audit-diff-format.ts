/**
 * Reads an audit entry's `changes` (jsonb written by `itap.audit_row_change` and the platform's
 * functions) into rows a person reads:
 * - `update`: `{ column: { old, new } }`, one row per column with before and after; a changed JSON
 *   object is opened into its changed keys (`config.schedule_cron`), up to {@link MAX_DEPTH} levels;
 * - `insert` / `delete`: the whole row as it was written or removed (one value per column);
 * - retention and erasure: `{ "retention": true }` (the row was purged, its values are not kept);
 * - any other action: the details the function recorded (`{ code, partial, … }`).
 * The database already stores secrets as `"[redacted]"`; on top of that a key named like a secret
 * (password, secret, token, hash) is shown as redacted whatever it holds, at any depth.
 */

export type AuditValue =
  | { readonly kind: 'empty' }
  | { readonly kind: 'redacted' }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'json'; readonly text: string };

export interface AuditDiffRow {
  /** The column, or a dotted path into a JSON column. */
  readonly field: string;
  readonly before?: AuditValue;
  readonly after?: AuditValue;
}

export type AuditDiff =
  | { readonly kind: 'none' }
  | { readonly kind: 'retention' }
  | { readonly kind: 'changes'; readonly rows: readonly AuditDiffRow[] }
  | { readonly kind: 'created' | 'removed' | 'details'; readonly rows: readonly AuditDiffRow[] };

/** What the database writes in place of a redacted column. */
export const REDACTED = '[redacted]';

/** How deep a changed JSON object is opened into its keys. */
export const MAX_DEPTH = 3;

const SECRET_KEY = /(^|_)(password|passwd|secret|token|api_key|private_key|hash)(_|$)/iu;

type Json = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether a key names a secret: its value is never shown. */
export function isSecretKey(key: string): boolean {
  // `has_secret` and the like say whether one is stored, not what it is.
  return !key.startsWith('has_') && SECRET_KEY.test(key);
}

/** A copy of `value` with every secret-named key and every `"[redacted]"` replaced by the marker. */
function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, isSecretKey(key) ? REDACTED : scrub(inner)]));
}

/** One value as shown: empty, redacted, a text, or (objects and arrays) indented JSON. */
export function auditValue(value: unknown, key = ''): AuditValue {
  if (isSecretKey(key) || value === REDACTED) return { kind: 'redacted' };
  if (value === null || value === undefined || value === '') return { kind: 'empty' };
  if (typeof value === 'string') return { kind: 'text', text: value };
  if (typeof value === 'number' || typeof value === 'boolean') return { kind: 'text', text: String(value) };
  return { kind: 'json', text: JSON.stringify(scrub(value), null, 2) };
}

const isChange = (value: unknown): value is { old?: unknown; new?: unknown } =>
  isObject(value) && Object.keys(value).every((key) => key === 'old' || key === 'new') && Object.keys(value).length > 0;

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The rows of one changed column, opening JSON objects into their changed keys. */
function changeRows(path: string, before: unknown, after: unknown, depth: number): AuditDiffRow[] {
  const key = path.split('.').pop() ?? path;
  if (isSecretKey(key)) return [{ field: path, before: { kind: 'redacted' }, after: { kind: 'redacted' } }];
  if (depth < MAX_DEPTH && isObject(before) && isObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    const rows = keys.filter((inner) => !same(before[inner], after[inner])).flatMap((inner) => changeRows(`${path}.${inner}`, before[inner], after[inner], depth + 1));
    if (rows.length > 0) return rows;
  }
  return [{ field: path, before: auditValue(before, key), after: auditValue(after, key) }];
}

const columnRows = (row: Json, side: 'before' | 'after'): AuditDiffRow[] =>
  Object.keys(row)
    .sort()
    .map((field) => ({ field, [side]: auditValue(row[field], field) }));

/** The entry's `changes`, read by its `action`. */
export function auditDiff(action: unknown, changes: unknown): AuditDiff {
  if (!isObject(changes) || Object.keys(changes).length === 0) return { kind: 'none' };
  if (changes.retention === true && Object.keys(changes).length === 1) return { kind: 'retention' };
  if (action === 'update' && Object.values(changes).every(isChange)) {
    const rows = Object.keys(changes)
      .sort()
      .flatMap((field) => {
        const change = changes[field] as { old?: unknown; new?: unknown };
        return changeRows(field, change.old, change.new, 0);
      });
    return { kind: 'changes', rows };
  }
  if (action === 'insert') return { kind: 'created', rows: columnRows(changes, 'after') };
  if (action === 'delete') return { kind: 'removed', rows: columnRows(changes, 'after') };
  return { kind: 'details', rows: columnRows(changes, 'after') };
}

/** A column name in words: `first_name` → "First name", `config.schedule_cron` → "Config › schedule cron". */
export function fieldWords(field: string): string {
  const words = field
    .split('.')
    .map((part) => part.replace(/_/gu, ' ').trim())
    .join(' › ');
  return words === '' ? field : words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A name for the audited row from what the entry holds (name, code, title…), or `null`: a deleted
 * or created row carries its columns, an update only the changed ones.
 */
export function auditRecordName(changes: unknown): string | null {
  if (!isObject(changes)) return null;
  for (const key of ['name', 'code', 'title', 'display_name', 'email']) {
    const value = changes[key];
    const text = isChange(value) ? (value.new ?? value.old) : value;
    if (typeof text === 'string' && text.trim() !== '' && text !== REDACTED && !isSecretKey(key)) return text;
  }
  return null;
}
