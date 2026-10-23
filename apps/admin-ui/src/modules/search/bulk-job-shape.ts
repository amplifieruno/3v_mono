import type { BulkJobKind } from '../../enums/bulk';

/**
 * A bulk job between its "new job" forms and its row (`itap.bulk_jobs`): the kind, the uploaded input
 * file and the options the kind takes (`itap.valid_bulk_job_options`: profile_import {dry_run};
 * profile_update {update_key, dry_run}; bulk_search {threshold 0.2..0.95, max_results 1..100}). Only
 * options that differ from the platform's defaults are needed, but every one shown is sent so the
 * job page says exactly what was asked.
 */

export type BulkJobOptions = Readonly<Record<string, string | number | boolean>>;

export interface NewBulkJob {
  readonly kind: BulkJobKind;
  readonly input_file_id: string;
  readonly options: BulkJobOptions;
}

const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** The options of a `kind` job from its form's values. */
export function bulkJobOptionsOf(kind: BulkJobKind, values: Readonly<Record<string, unknown>>): BulkJobOptions {
  if (kind === 'bulk_search') {
    const threshold = finite(values.threshold);
    return { ...(threshold === null ? {} : { threshold }), max_results: finite(values.max_results) ?? 5 };
  }
  const dryRun = { dry_run: values.dry_run === true };
  return kind === 'profile_update'
    ? { update_key: typeof values.update_key === 'string' ? values.update_key : 'employee_id', ...dryRun }
    : dryRun;
}

/** The row a "new job" form inserts. */
export function newBulkJobOf(kind: BulkJobKind, values: Readonly<Record<string, unknown>>): NewBulkJob {
  return {
    kind,
    input_file_id: typeof values.input_file_id === 'string' ? values.input_file_id : '',
    options: bulkJobOptionsOf(kind, values),
  };
}

/** Counts of a job as the progress block shows them. */
export interface BulkCounts {
  readonly total: number | null;
  readonly processed: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly skipped: number;
}

/**
 * The rows not accounted for: of a finished job, the input rows that got no outcome (a cancelled job
 * stops before the end), so succeeded + failed + skipped + not processed = total (Review Focus 3).
 */
export function notProcessed(counts: BulkCounts): number {
  if (counts.total === null) return 0;
  return Math.max(0, counts.total - counts.succeeded - counts.failed - counts.skipped);
}

/** The share of rows read so far, 0..100, or `null` before the file was read (the total unknown). */
export function progressPercent(counts: BulkCounts): number | null {
  if (counts.total === null) return null;
  if (counts.total === 0) return 100;
  return Math.min(100, Math.round((counts.processed / counts.total) * 100));
}
