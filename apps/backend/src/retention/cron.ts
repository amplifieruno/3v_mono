import { defineCronHandler } from '../events/types.js';
import type { HasuraClient } from '../hasura/client.js';
import { createStorageClient } from '../storage/storageClient.js';
import { drainFileDeletions } from './fileQueue.js';

const ORGANIZATIONS = `query RetentionOrganizations { organizations(order_by: { id: asc }) { id } }`;
const RUN = `
  mutation RunRetention($organization: uuid!, $at: timestamptz!) {
    run_retention(args: { p_organization: $organization, p_at: $at }) { id status }
  }
`;

/** Calls per organization and cron delivery (each call is one transaction with a 20 s budget). */
export const MAX_CALLS_PER_ORGANIZATION = 12;

/**
 * Runs itap.run_retention for one organization at the scheduled time until the run is no longer `running` (or the
 * call limit is reached: the run keeps its lease and the next cron run takes over). Returns the last status, or null
 * when the organization is gone.
 */
export async function runOrganizationRetention(
  admin: HasuraClient,
  organizationId: string,
  at: string,
  maxCalls = MAX_CALLS_PER_ORGANIZATION,
): Promise<string | null> {
  let status: string | null = null;
  for (let call = 0; call < maxCalls; call += 1) {
    const data = await admin.request<{ run_retention: { id: string; status: string }[] }>(RUN, {
      organization: organizationId,
      at,
    });
    status = data.run_retention[0]?.status ?? null;
    if (status !== 'running') return status;
  }
  return status;
}

/**
 * Cron `retention_cleanup` (daily, spec §8.3): every organization's retention run at the scheduled time (policies,
 * legal holds, resumable batches; a retry of the same delivery resumes or returns the finished run), then the storage
 * deletion queue is drained through the storage API. Organizations fail independently; the delivery fails (Hasura
 * retries) when any organization failed, after the drain.
 */
export const retentionCleanup = defineCronHandler(async (payload, ctx) => {
  const scheduled = new Date(payload.scheduled_time);
  if (Number.isNaN(scheduled.getTime())) throw new Error(`Invalid scheduled_time: ${payload.scheduled_time}`);
  const at = scheduled.toISOString();
  const { organizations } = await ctx.admin.request<{ organizations: { id: string }[] }>(ORGANIZATIONS);
  let failed = 0;
  let unfinished = 0;
  for (const { id } of organizations) {
    try {
      if ((await runOrganizationRetention(ctx.admin, id, at)) === 'running') unfinished += 1;
    } catch (error: unknown) {
      failed += 1;
      console.error(`Retention failed for organization ${id}:`, error);
    }
  }
  const files = await drainFileDeletions(ctx.admin, createStorageClient(ctx.env), new Date());
  if (failed > 0) throw new Error(`retention_cleanup: failed for ${failed} of ${organizations.length} organizations`);
  return { organizations: organizations.length, unfinished, files_deleted: files.deleted, files_failed: files.failed };
});
