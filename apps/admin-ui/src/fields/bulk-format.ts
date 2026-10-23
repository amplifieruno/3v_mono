/**
 * Bulk job codes and options in words (`console.bulk.*`, `src/i18n/bulk/en.ts`). A job's `error` and a
 * row's `error` are codes (`required:email`, `header_unknown:badge`, `csv_invalid: unterminated quoted
 * field in record 3`, `no_face`): the backend reader (`apps/backend/src/bulk/`) and the row writers
 * (`itap.bulk_apply_profile_row`, `itap.record_bulk_job_row`) document them. A code the console does not
 * know reads as "Refused: <code>", so nothing is hidden.
 */

export type BulkText = (key: string, params?: Readonly<Record<string, unknown>>) => string;

/** Codes read as their sentence alone. */
const PLAIN = new Set([
  'company_not_found',
  'company_ambiguous',
  'work_schedule_not_found',
  'work_schedule_ambiguous',
  'profile_not_found',
  'profile_key_ambiguous',
  'column_count_mismatch',
  'unknown_error',
  'no_face',
  'low_quality',
  'invalid_image',
  'file_not_found',
  'search_unavailable',
  'invalid_input',
  'invalid_filters',
  'interrupted',
  'bulk_input_missing',
  'file_too_large',
  'too_many_rows',
  'header_missing',
  'header_empty_column',
  'header_no_update_columns',
  'all_rows_failed',
  'max_attempts',
  'owner_inactive',
]);

/** Codes carrying a column (or a key, a rule, a reason) after a colon; the value is `{{column}}`. */
const WITH_ARGUMENT: Readonly<Record<string, string>> = {
  required: 'required',
  invalid_value: 'invalid_value',
  invalid_date: 'invalid_date',
  custom_field_invalid: 'custom_field_invalid',
  unknown_column: 'unknown_column',
  constraint: 'constraint',
  csv_invalid: 'csv_invalid',
  header_unknown: 'header_unknown',
  header_duplicate: 'header_duplicate',
  // `header_missing:<column>` (a required column), not `header_missing` (no header at all).
  header_missing: 'header_missing_column',
  unsupported_kind: 'unsupported_kind',
};

/** A job's or row's error code as a sentence; `null` for no error. */
export function bulkErrorText(code: unknown, t: BulkText): string | null {
  if (typeof code !== 'string' || code.trim() === '') return null;
  const value = code.trim();
  if (PLAIN.has(value)) return t(`console.bulk.errors.${value}`);
  const at = value.indexOf(':');
  if (at > 0) {
    const key = WITH_ARGUMENT[value.slice(0, at)];
    const argument = value.slice(at + 1).trim();
    if (key !== undefined && argument !== '') return t(`console.bulk.errors.${key}`, { column: `“${argument}”` });
  }
  return t('console.bulk.fallback', { code: value });
}

/** A job's options (`itap.valid_bulk_job_options`) as lines, per kind; the key column by its label. */
export function bulkOptionLines(kind: unknown, options: unknown, t: BulkText, keyLabel: (key: string) => string): string[] {
  const o = typeof options === 'object' && options !== null && !Array.isArray(options) ? (options as Readonly<Record<string, unknown>>) : {};
  if (kind === 'bulk_search') {
    return [
      typeof o.threshold === 'number' ? t('console.bulk.options.threshold', { value: o.threshold }) : t('console.bulk.options.thresholdDefault'),
      t('console.bulk.options.maxResults', { value: typeof o.max_results === 'number' ? o.max_results : 5 }),
    ];
  }
  const lines = kind === 'profile_update' ? [t('console.bulk.options.updateKey', { key: keyLabel(typeof o.update_key === 'string' ? o.update_key : 'employee_id') })] : [];
  return [...lines, t(o.dry_run === true ? 'console.bulk.options.dryRun' : 'console.bulk.options.applied')];
}
