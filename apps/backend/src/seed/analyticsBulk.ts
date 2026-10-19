import { bulkDeps } from '../bulk/handlers.js';
import { runBulkJob } from '../bulk/runner.js';
import { createHasuraClient } from '../hasura/client.js';
import { bulkSearchCsv, contractorImportCsv, localAt, partialImportCsv } from './analyticsPlan.js';
import type { SearchImages } from './analyticsSearch.js';
import { localDate } from './historyTime.js';
import type { SeedContext } from './tenancy.js';

/**
 * Bulk jobs of the seed (slice 7, design §9) through the real runner: a completed profile import (8 contractors), a
 * partial one with row errors and its result file (both by the Nova Tower admin, organization-visible), and a
 * bulk face search by the admin (owner-only job, rows with private_owner_id, result file and search requests). Each
 * input CSV is uploaded as the owner's `bulk_input` file and the job inserted with the owner's org_admin session (the
 * owner is stamped from it); the seed then runs the job in-process (the live run_bulk_job handler may claim it first:
 * the claim decides, the seed waits for the end state) and back-dates it. Idempotent: only when the organization
 * has no bulk jobs.
 */
export type SeedBulkResult = { jobs: number; statuses: string[] };

const STATE = `query SeedBulkState($org: uuid!) { bulk_jobs_aggregate(where: { organization_id: { _eq: $org } }) { aggregate { count } } }`;
const OWN_FILE = `
  mutation SeedBulkInputOwner($id: uuid!, $user: uuid!) { updateFile(pk_columns: { id: $id }, _set: { uploadedByUserId: $user }) { id } }
`;
const INSERT = `
  mutation SeedBulkJob($object: bulk_jobs_insert_input!) { insert_bulk_jobs_one(object: $object) { id } }
`;
const JOB = `query SeedBulkJobState($id: uuid!) { bulk_jobs_by_pk(id: $id) { status started_at completed_at } }`;
const BACKDATE = `
  mutation SeedBulkBackdate($id: uuid!, $created: timestamptz!, $started: timestamptz!, $completed: timestamptz!) {
    update_bulk_jobs_by_pk(pk_columns: { id: $id }, _set: { created_at: $created, started_at: $started, completed_at: $completed }) { id }
    update_bulk_job_rows(where: { bulk_job_id: { _eq: $id } }, _set: { created_at: $started }) { affected_rows }
    update_search_requests(where: { bulk_job_id: { _eq: $id } }, _set: { created_at: $started, started_at: $started, completed_at: $started }) {
      affected_rows
    }
  }
`;

const TERMINAL = new Set(['completed', 'partial', 'failed', 'cancelled']);
const iso = (ms: number): string => new Date(ms).toISOString();

type JobSpec = { owner: string; kind: string; name: string; data: Buffer; at: number };

async function runJob(ctx: SeedContext, org: string, spec: JobSpec): Promise<string> {
  const { id: fileId } = await ctx.storage.upload({
    bucketId: org,
    name: spec.name,
    mimeType: 'text/csv',
    data: spec.data,
    metadata: { kind: 'bulk_input' },
  });
  await ctx.admin.request(OWN_FILE, { id: fileId, user: spec.owner });
  const owner = createHasuraClient(ctx.env, { role: 'org_admin', userId: spec.owner, organizationId: org });
  const { insert_bulk_jobs_one: job } = await owner.request<{ insert_bulk_jobs_one: { id: string } }>(INSERT, {
    object: { kind: spec.kind, input_file_id: fileId, options: {} },
  });
  await runBulkJob(job.id, bulkDeps(ctx.env, ctx.admin));
  type State = { status: string; started_at: string | null; completed_at: string | null };
  let state: State | null = null;
  for (let i = 0; i < 240; i += 1) {
    state = (await ctx.admin.request<{ bulk_jobs_by_pk: State | null }>(JOB, { id: job.id })).bulk_jobs_by_pk;
    if (state && TERMINAL.has(state.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!state || !TERMINAL.has(state.status)) throw new Error(`seed: bulk job ${job.id} did not finish`);
  const took = Math.max(1000, Date.parse(state.completed_at ?? '') - Date.parse(state.started_at ?? '') || 1000);
  await ctx.admin.request(BACKDATE, { id: job.id, created: iso(spec.at - 4000), started: iso(spec.at), completed: iso(spec.at + took) });
  return state.status;
}

export async function seedBulkJobs(
  ctx: SeedContext,
  args: { org: string; admin: string; novaAdmin: string; timezone: string; images: SearchImages },
): Promise<SeedBulkResult> {
  const { org, timezone } = args;
  const state = await ctx.admin.request<{ bulk_jobs_aggregate: { aggregate: { count: number } } }>(STATE, { org });
  if (state.bulk_jobs_aggregate.aggregate.count > 0) return { jobs: 0, statuses: [] };
  const importAt = localAt(ctx.now, timezone, 9, 10 * 60 + 20);
  const partialAt = localAt(ctx.now, timezone, 4, 14 * 60 + 5);
  const searchAt = localAt(ctx.now, timezone, 1, 11 * 60 + 30);
  const images = [
    { fileId: await args.images({ role: 'blacklisted', nth: 0 }), label: 'Loading dock still' },
    { fileId: await args.images({ role: 'unknown', nth: 0 }), label: 'Lobby lounge still' },
    { fileId: await args.images({ role: 'vip', nth: 0 }), label: 'Parking gate still' },
  ];
  const specs: JobSpec[] = [
    { owner: args.novaAdmin, kind: 'profile_import', name: 'contractors-keystone-lumen.csv', data: contractorImportCsv(localDate(importAt, timezone)), at: importAt },
    { owner: args.novaAdmin, kind: 'profile_import', name: 'contractors-cleaning.csv', data: partialImportCsv(localDate(partialAt, timezone)), at: partialAt },
    { owner: args.admin, kind: 'bulk_search', name: 'camera-stills.csv', data: bulkSearchCsv(images), at: searchAt },
  ];
  const statuses: string[] = [];
  for (const spec of specs) statuses.push(await runJob(ctx, org, spec));
  return { jobs: specs.length, statuses };
}
