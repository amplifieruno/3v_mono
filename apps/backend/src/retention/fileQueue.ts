import type { HasuraClient } from '../hasura/client.js';
import { StorageError, type StorageClient } from '../storage/storageClient.js';

/**
 * Storage deletion queue (slice 10): SQL purges and erasure enqueue files in `itap.pending_file_deletions`; the
 * backend deletes them through the storage API (never by deleting storage rows in SQL, so objects do not leak).
 * A successful delete removes the queue row (FK CASCADE from storage.files). A 404 means the file is already gone:
 * the queue row (and a leftover storage row, if any) is removed. Other failures count an attempt and keep the last
 * error; a row is retried after an exponential backoff (2^attempts minutes, at most 6 h) and given up after
 * MAX_ATTEMPTS (it stays visible with its last_error).
 */

export type PendingDeletion = { id: string; file_id: string; attempts: number; last_attempt_at: string | null };
export type DrainResult = { deleted: number; failed: number; skipped: number };

export const MAX_ATTEMPTS = 10;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;

const PENDING = `
  query PendingFileDeletions($limit: Int!, $max: Int!) {
    pending_file_deletions(
      where: { attempts: { _lt: $max } }
      order_by: [{ last_attempt_at: asc_nulls_first }, { enqueued_at: asc }]
      limit: $limit
    ) { id file_id attempts last_attempt_at }
  }
`;
const FORGET = `
  mutation ForgetFileDeletion($id: uuid!, $file: uuid!) {
    delete_pending_file_deletions_by_pk(id: $id) { id }
    deleteFile(id: $file) { id }
  }
`;
const FAIL = `
  mutation FailFileDeletion($id: uuid!, $attempts: Int!, $at: timestamptz!, $error: String!) {
    update_pending_file_deletions_by_pk(
      pk_columns: { id: $id }
      _set: { attempts: $attempts, last_attempt_at: $at, last_error: $error }
    ) { id }
  }
`;

/** Whether a queued deletion may be tried now (new, or its backoff passed). */
export function isDue(row: PendingDeletion, now: Date): boolean {
  if (row.attempts === 0 || row.last_attempt_at === null) return true;
  const backoff = Math.min(2 ** row.attempts * 60_000, MAX_BACKOFF_MS);
  return new Date(row.last_attempt_at).getTime() + backoff <= now.getTime();
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replaceAll('\u0000', '').slice(0, 500);
}

/** Drains up to `limit` queued deletions (all organizations). One failing file never stops the drain. */
export async function drainFileDeletions(
  admin: HasuraClient,
  storage: StorageClient,
  now: Date,
  limit = 500,
): Promise<DrainResult> {
  const { pending_file_deletions: rows } = await admin.request<{ pending_file_deletions: PendingDeletion[] }>(PENDING, {
    limit,
    max: MAX_ATTEMPTS,
  });
  const result: DrainResult = { deleted: 0, failed: 0, skipped: 0 };
  for (const row of rows) {
    if (!isDue(row, now)) {
      result.skipped += 1;
      continue;
    }
    try {
      await storage.deleteFile(row.file_id);
      result.deleted += 1;
    } catch (error: unknown) {
      if (error instanceof StorageError && error.status === 404) {
        await admin.request(FORGET, { id: row.id, file: row.file_id });
        result.deleted += 1;
        continue;
      }
      result.failed += 1;
      await admin.request(FAIL, { id: row.id, attempts: row.attempts + 1, at: now.toISOString(), error: errorText(error) });
    }
  }
  return result;
}
