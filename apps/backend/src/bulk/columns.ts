/**
 * Bulk job input columns (spec §6.11, SA_3 §2.1.2 / §2.1.4). The first CSV record is the header; columns are matched
 * by name (case and surrounding spaces ignored, except the key after `custom.`), in any order.
 *   profile_import: first_name, last_name (required), email, phone, profile_type, company (id or name), department,
 *                   job_title, employee_id, start_date, end_date (YYYY-MM-DD), access_level, work_schedule (name),
 *                   custom.<key> (a profile custom attribute definition of the organization).
 *   profile_update: the update key column (options.update_key: employee_id | email | code) plus at least one of the
 *                   profile_import columns; empty cells leave values unchanged.
 *   bulk_search:    image_file_id (required; a `search` image uploaded by the job owner), label (optional).
 * Any other column fails the job before a row is applied.
 */
export const BULK_KINDS = ['profile_import', 'profile_update', 'bulk_search'] as const;
export type BulkKind = (typeof BULK_KINDS)[number];

export const PROFILE_COLUMNS = [
  'first_name', 'last_name', 'email', 'phone', 'profile_type', 'company', 'department', 'job_title', 'employee_id',
  'start_date', 'end_date', 'access_level', 'work_schedule',
] as const;
export const UPDATE_KEYS = ['employee_id', 'email', 'code'] as const;
export const SEARCH_COLUMNS = ['image_file_id', 'label'] as const;
export const CUSTOM_PREFIX = 'custom.';

/** Limits checked before any row is applied. */
export const MAX_ROWS = 10_000;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const DEFAULT_SEARCH_RESULTS = 5;

export type HeaderResult = { ok: true; columns: string[] } | { ok: false; error: string };

export function isBulkKind(value: string): value is BulkKind {
  return (BULK_KINDS as readonly string[]).includes(value);
}

function normalize(name: string): string {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  return lower.startsWith(CUSTOM_PREFIX) ? `${CUSTOM_PREFIX}${trimmed.slice(CUSTOM_PREFIX.length).trim()}` : lower;
}

function allowed(kind: BulkKind, column: string, updateKey: string, customKeys: ReadonlySet<string>): boolean {
  if (kind === 'bulk_search') return (SEARCH_COLUMNS as readonly string[]).includes(column);
  if (column.startsWith(CUSTOM_PREFIX)) return customKeys.has(column.slice(CUSTOM_PREFIX.length));
  if ((PROFILE_COLUMNS as readonly string[]).includes(column)) return true;
  return kind === 'profile_update' && column === updateKey;
}

/** Normalized header, or the first problem (`header_*` error code naming the column). */
export function validateHeader(
  kind: BulkKind,
  header: string[],
  options: { updateKey: string; customKeys: ReadonlySet<string> },
): HeaderResult {
  const columns = header.map(normalize);
  const seen = new Set<string>();
  for (const column of columns) {
    if (column === '' || column === CUSTOM_PREFIX) return { ok: false, error: 'header_empty_column' };
    if (seen.has(column)) return { ok: false, error: `header_duplicate:${column}` };
    seen.add(column);
    if (!allowed(kind, column, options.updateKey, options.customKeys)) return { ok: false, error: `header_unknown:${column}` };
  }
  const required =
    kind === 'profile_import' ? ['first_name', 'last_name'] : kind === 'profile_update' ? [options.updateKey] : ['image_file_id'];
  const missing = required.find((c) => !seen.has(c));
  if (missing) return { ok: false, error: `header_missing:${missing}` };
  if (kind === 'profile_update' && columns.length < 2) return { ok: false, error: 'header_no_update_columns' };
  return { ok: true, columns };
}

export type RowValues = { kind: 'values'; values: Record<string, string> } | { kind: 'blank' } | { kind: 'mismatch' };

/** Trimmed non-empty cells by column; a record of only empty cells is blank; another field count is a mismatch. */
export function rowValues(columns: string[], cells: string[]): RowValues {
  if (cells.every((c) => c.trim() === '')) return { kind: 'blank' };
  if (cells.length !== columns.length) return { kind: 'mismatch' };
  const values: Record<string, string> = {};
  columns.forEach((column, i) => {
    const value = cells[i].trim();
    if (value !== '') values[column] = value;
  });
  return { kind: 'values', values };
}

export type BulkOptions = { updateKey: string; dryRun: boolean; threshold: number | null; maxResults: number };

/** Job options (shape validated by the bulk_jobs CHECK) with defaults. */
export function resolveBulkOptions(options: Record<string, unknown>): BulkOptions {
  return {
    updateKey: typeof options.update_key === 'string' ? options.update_key : 'employee_id',
    dryRun: options.dry_run === true,
    threshold: typeof options.threshold === 'number' ? options.threshold : null,
    maxResults: typeof options.max_results === 'number' ? options.max_results : DEFAULT_SEARCH_RESULTS,
  };
}
