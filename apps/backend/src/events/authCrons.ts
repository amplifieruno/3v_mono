import type { HasuraClient } from '../hasura/client.js';
import { createStorageClient, type StorageClient } from '../storage/storageClient.js';
import { perOrganizationCron } from './trackingCrons.js';
import { defineCronHandler } from './types.js';

const EXPIRE_SESSIONS = `
  mutation ExpireAuthSessions($organization: uuid!, $at: timestamptz!) {
    expire_auth_sessions(args: { p_organization: $organization, p_at: $at }) { id }
  }
`;
const CAPTURES = `
  query StaleAuthCaptures($before: timestamptz!) {
    files(where: { metadata: { _contains: { kind: "auth_capture" } }, createdAt: { _lt: $before } },
          order_by: { createdAt: asc }, limit: 200) { id }
  }
`;
const REFERENCED = `
  query ReferencedAuthCaptures($ids: [uuid!]!) {
    authentication_attempts(where: { evidence_file_id: { _in: $ids } }) { evidence_file_id }
  }
`;

/** Evidence captures are uploaded before the decision; an unreferenced one older than this is an orphan. */
export const EVIDENCE_ORPHAN_AGE_MS = 10 * 60_000;

/**
 * Deletes auth_capture files older than 10 minutes that no attempt references (a success whose evidence delete
 * failed, a decision that errored after the upload). At most 200 per run; returns the number deleted.
 */
export async function sweepAuthEvidence(admin: HasuraClient, storage: StorageClient, at: Date): Promise<number> {
  const before = new Date(at.getTime() - EVIDENCE_ORPHAN_AGE_MS).toISOString();
  const { files } = await admin.request<{ files: { id: string }[] }>(CAPTURES, { before });
  if (files.length === 0) return 0;
  const ids = files.map((f) => f.id);
  const { authentication_attempts: used } = await admin.request<{ authentication_attempts: { evidence_file_id: string }[] }>(
    REFERENCED,
    { ids },
  );
  const referenced = new Set(used.map((u) => u.evidence_file_id));
  const orphans = ids.filter((id) => !referenced.has(id));
  for (const id of orphans) await storage.deleteFile(id);
  return orphans.length;
}

const expireSessions = perOrganizationCron('expire_auth_sessions', EXPIRE_SESSIONS);

/**
 * Cron `expire_auth_sessions` (every minute, at scheduled_time): open face authentication sessions past expires_at
 * become `expired` (review sessions are never touched; a retry of the same run is a no-op), then the evidence sweep.
 */
export const expireAuthSessions = defineCronHandler(async (payload, ctx) => {
  const result = await expireSessions.handle(payload, ctx);
  const evidenceDeleted = await sweepAuthEvidence(ctx.admin, createStorageClient(ctx.env), new Date(payload.scheduled_time));
  return { ...(result ?? {}), evidence_deleted: evidenceDeleted };
});
