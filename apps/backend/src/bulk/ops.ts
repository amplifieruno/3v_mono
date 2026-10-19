import { HasuraError, type HasuraClient } from '../hasura/client.js';
import type { SearchDeps } from '../search/searchService.js';
import type { StorageClient } from '../storage/storageClient.js';

/** Bulk job SQL calls (migrations *_create_bulk_job_lifecycle, *_create_bulk_profile_rows). */

export type BulkDeps = {
  /** Admin secret without a session: lifecycle functions, file and row reads. */
  admin: HasuraClient;
  storage: StorageClient;
  /** The job owner as org_admin of the job's organization (profile rows: permissions, CHECKs, audit as the owner). */
  asOwner: (organizationId: string, userId: string) => HasuraClient;
  /** Search core dependencies acting as the owner (bulk_search rows). */
  searchAs: (organizationId: string, userId: string) => SearchDeps;
  /** Clock for the progress cadence (tests). */
  now?: () => number;
  /** Delay between retries of a row after a transient database error (tests). */
  sleep?: (ms: number) => Promise<void>;
};

export const JOB_FIELDS = 'id code organization_id owner_id kind options input_file_id status attempts total processed result_file_id';

export type Job = {
  id: string;
  code: string;
  organization_id: string;
  owner_id: string;
  kind: string;
  options: Record<string, unknown>;
  input_file_id: string | null;
  status: string;
  attempts: number;
  total: number | null;
  processed: number;
  result_file_id: string | null;
};

export const CLAIM = `mutation ClaimBulkJob($id: uuid!) { claim_bulk_job(args: { p_job: $id }) { ${JOB_FIELDS} } }`;
export const PROGRESS = `
  mutation BulkJobProgress($id: uuid!, $attempt: Int!, $total: Int, $processed: Int) {
    bulk_job_progress(args: { p_job: $id, p_attempt: $attempt, p_total: $total, p_processed: $processed }) { ${JOB_FIELDS} }
  }
`;
export const COMPLETE = `
  mutation CompleteBulkJob($id: uuid!, $attempt: Int!, $file: uuid) {
    complete_bulk_job(args: { p_job: $id, p_attempt: $attempt, p_result_file: $file }) { id status }
  }
`;
export const FAIL = `
  mutation FailBulkJob($id: uuid!, $attempt: Int!, $error: String!) {
    fail_bulk_job(args: { p_job: $id, p_attempt: $attempt, p_error: $error }) { id status }
  }
`;
export const APPLY_PROFILE_ROW = `
  mutation BulkApplyProfileRow($id: uuid!, $attempt: Int!, $row: Int!, $data: jsonb!) {
    bulk_apply_profile_row(args: { p_job: $id, p_attempt: $attempt, p_row_no: $row, p_data: $data }) { row_no outcome }
  }
`;
export const RECORD_ROW = `
  mutation RecordBulkJobRow(
    $id: uuid!, $attempt: Int!, $row: Int!, $outcome: String, $error: String, $label: String, $request: uuid
  ) {
    record_bulk_job_row(args: {
      p_job: $id, p_attempt: $attempt, p_row_no: $row, p_outcome: $outcome, p_error: $error, p_label: $label,
      p_search_request: $request
    }) { row_no outcome }
  }
`;
export const DUE = `
  query DueBulkJobs($at: timestamptz!, $limit: Int!) { due_bulk_jobs(args: { p_at: $at, p_limit: $limit }) { id organization_id } }
`;

export const CLOSE_STALE_SEARCHES = `
  mutation CloseStaleSearchRequests($at: timestamptz!) { close_stale_search_requests(args: { p_at: $at }) { id } }
`;

/** The job stopped being this worker's (cancelled, reclaimed, owner inactive): stop without touching it. */
export class JobStopped extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'JobStopped';
  }
}

/** A job-level failure recorded as the job error (header / limit / file problems). */
export class JobFailure extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'JobFailure';
    this.code = code;
  }
}

const STOP_CODES = /bulk_job_not_claimed|bulk_job_owner_inactive|bulk_job_not_owner/;

/** Maps a row writer's refusal because the job is no longer this worker's onto JobStopped. */
export function stopIfNotMine(error: unknown): unknown {
  if (error instanceof HasuraError) {
    const match = STOP_CODES.exec(`${error.message} ${error.detail ?? ''}`);
    if (match) return new JobStopped(match[0]);
  }
  return error;
}
