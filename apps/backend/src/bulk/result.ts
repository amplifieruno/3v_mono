import { formatCsv } from '../reports/render/csv.js';
import type { BulkKind } from './columns.js';

/** A bulk_job_rows row as the result file needs it. */
export type JobRow = {
  row_no: number;
  outcome: string;
  profile_id: string | null;
  identity_id: string | null;
  search_request_id: string | null;
  entity_code: string | null;
  label: string | null;
  confidence: number | null;
  error: string | null;
};

export const JOB_ROW_FIELDS = 'row_no outcome profile_id identity_id search_request_id entity_code label confidence error';

/**
 * Result file of a bulk job (CSV, one line per input record in row order): row_no, outcome (created / updated /
 * validated / skipped / failed; bulk_search: matched / no_match / failed), entity_id + entity_code (the profile, or
 * the top matching identity), error; bulk_search adds label, confidence and search_request_id.
 */
export function resultCsv(kind: BulkKind, rows: JobRow[]): Buffer {
  const search = kind === 'bulk_search';
  const header = ['row_no', 'outcome', 'entity_id', 'entity_code', 'error', ...(search ? ['label', 'confidence', 'search_request_id'] : [])];
  const lines = rows.map((r) => [
    r.row_no,
    r.outcome,
    search ? r.identity_id : r.profile_id,
    r.entity_code,
    r.error,
    ...(search ? [r.label, r.confidence, r.search_request_id] : []),
  ]);
  return formatCsv([header, ...lines]);
}
