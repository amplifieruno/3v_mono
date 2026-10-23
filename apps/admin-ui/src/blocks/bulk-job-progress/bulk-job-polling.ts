import { BULK_PENDING_STATUSES } from '../../enums/bulk';
import type { BulkJobProgress } from '../../modules/search/bulk-job-ops';

/** How often a queued or running job is read again (its worker reports every 25 rows or 2 seconds). */
export const BULK_POLL_MS = 2000;
/** How long one page keeps reading a job that does not finish (a job stuck queued, a long search). */
export const BULK_POLL_LIMIT_MS = 30 * 60_000;

/** Whether to read the job again: it is still moving, and this page has not been reading it too long. */
export function bulkJobPending(job: BulkJobProgress | null | undefined, fallbackStatus: string | null, since: number, now: number): boolean {
  return BULK_PENDING_STATUSES.has(job?.status ?? fallbackStatus ?? '') && now - since < BULK_POLL_LIMIT_MS;
}
