import { defineCronHandler } from '../events/types.js';
import type { HasuraClient } from '../hasura/client.js';
import { createStorageClient, StorageError, type StorageClient } from '../storage/storageClient.js';

/**
 * Storage deletion queue (slice 10): SQL purges and erasure enqueue files in `itap.pending_file_deletions`; the
 * backend deletes them through the storage API (never by deleting storage rows in SQL, so objects do not leak).
 * `itap.claim_file_deletions` hands out due rows (leased, SKIP LOCKED; backoff 2^attempts minutes up to 6 h, 10
 * attempts) and drops rows whose file is referenced again. A successful delete removes the queue row (FK CASCADE
 * from storage.files); a 404 means the file is already gone: the queue row (and a leftover storage row, if any) is
 * removed. Other failures count an attempt, keep the last error and release the lease.
 */

export type PendingDeletion = { id: string; file_id: string; attempts: number };
export type DrainResult = { deleted: number; failed: number };

/** Files per drain (daily retention run and the 10-minute cron). */
export const DRAIN_LIMIT = 500;

/**
 * How long a face source photo (kind `face_source`, uploaded by the console for an enrollment action) is kept: the
 * action stores its own crop, so the original is queued once this old whatever the outcome (accepted, refused or an
 * abandoned form). The grace lets a refused form be sent again and its result show the refused photos.
 */
export const FACE_SOURCE_GRACE_MS = 60 * 60 * 1000;

const CLAIM = `
  mutation ClaimFileDeletions($limit: Int!) {
    claim_file_deletions(args: { p_limit: $limit }) { id file_id attempts }
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
      _set: { attempts: $attempts, last_attempt_at: $at, last_error: $error, lease_expires_at: null }
    ) { id }
  }
`;

const SWEEP_FACE_SOURCES = `
  mutation EnqueueStaleFaceSources($before: timestamptz!, $limit: Int!) {
    enqueue_stale_face_sources(args: { p_older_than: $before, p_limit: $limit }) { id }
  }
`;

/** Queues unused face source photos older than the grace (all organizations); returns how many were queued. */
export async function queueStaleFaceSources(admin: HasuraClient, now: Date, limit = DRAIN_LIMIT): Promise<number> {
  const before = new Date(now.getTime() - FACE_SOURCE_GRACE_MS).toISOString();
  const { enqueue_stale_face_sources: rows } = await admin.request<{ enqueue_stale_face_sources: { id: string }[] }>(
    SWEEP_FACE_SOURCES,
    { before, limit },
  );
  return rows.length;
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replaceAll('\u0000', '').slice(0, 500);
}

/** Drains up to `limit` claimed deletions (all organizations). One failing file never stops the drain. */
export async function drainFileDeletions(
  admin: HasuraClient,
  storage: StorageClient,
  now: Date,
  limit = DRAIN_LIMIT,
): Promise<DrainResult> {
  const { claim_file_deletions: rows } = await admin.request<{ claim_file_deletions: PendingDeletion[] }>(CLAIM, { limit });
  const result: DrainResult = { deleted: 0, failed: 0 };
  for (const row of rows) {
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

/**
 * Cron `drain_file_deletions` (every 10 minutes): queues stale face source photos, then drains the queue between
 * daily retention runs.
 */
export const drainFileDeletionsCron = defineCronHandler(async (_payload, ctx) => {
  const now = new Date();
  const faceSources = await queueStaleFaceSources(ctx.admin, now);
  const files = await drainFileDeletions(ctx.admin, createStorageClient(ctx.env), now);
  return { face_sources_queued: faceSources, files_deleted: files.deleted, files_failed: files.failed };
});
