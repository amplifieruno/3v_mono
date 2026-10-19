import { randomUUID } from 'node:crypto';
import { resumeBulkJobs } from '../../../src/bulk/handlers.js';
import type { HasuraClient } from '../../../src/hasura/client.js';
import { asAdmin, orgAdminToken, testEnv } from './clients.js';
import { trackFile } from './registry.js';
import { waitFor } from './sending.js';

/** Bulk jobs (slice 7, task 4) helpers. */

export type BulkJob = {
  id: string;
  code: string;
  kind: string;
  owner_id: string;
  status: string;
  total: number | null;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: { row_no: number; error: string }[];
  error: string | null;
  attempts: number;
  result_file_id: string | null;
  input_file_id: string | null;
};
export const JOB_FIELDS = 'id code kind owner_id status total processed succeeded failed skipped errors error attempts result_file_id input_file_id';

export type BulkRow = {
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
const ROW_FIELDS = 'row_no outcome profile_id identity_id search_request_id entity_code label confidence error';

/** Uploads CSV text to the organization bucket as `userId` (org admin token), kind bulk_input unless overridden. */
export async function uploadCsv(userId: string, orgId: string, csv: string, kind: string | null = 'bulk_input'): Promise<string> {
  const name = `bulk-${randomUUID()}.csv`;
  const form = new FormData();
  form.append('bucket-id', orgId);
  form.append('metadata[]', JSON.stringify({ name, ...(kind ? { metadata: { kind } } : {}) }));
  form.append('file[]', new Blob([csv], { type: 'text/csv' }), name);
  const res = await fetch(`${testEnv().NHOST_STORAGE_URL}/files`, {
    method: 'POST',
    headers: { authorization: `Bearer ${orgAdminToken(userId, orgId)}` },
    body: form,
  });
  if (!res.ok) throw new Error(`uploadCsv failed (${res.status}): ${await res.text()}`);
  const id = ((await res.json()) as { processedFiles?: { id: string }[] }).processedFiles?.[0]?.id;
  if (!id) throw new Error('uploadCsv: no processed file');
  trackFile(id);
  return id;
}

export async function insertJob(client: HasuraClient, object: Record<string, unknown>): Promise<BulkJob> {
  const data = await client.request<{ insert_bulk_jobs_one: BulkJob }>(
    `mutation ($o: bulk_jobs_insert_input!) { insert_bulk_jobs_one(object: $o) { ${JOB_FIELDS} } }`,
    { o: object },
  );
  return data.insert_bulk_jobs_one;
}

/** Uploads `csv` as the owner and inserts a job of `kind` (the run_bulk_job trigger starts it in the backend). */
export async function startJob(
  client: HasuraClient,
  userId: string,
  orgId: string,
  kind: string,
  csv: string,
  options: Record<string, unknown> = {},
): Promise<BulkJob> {
  return insertJob(client, { kind, input_file_id: await uploadCsv(userId, orgId, csv), options });
}

export async function bulkJob(id: string): Promise<BulkJob> {
  const data = await asAdmin().request<{ bulk_jobs_by_pk: BulkJob }>(`query ($id: uuid!) { bulk_jobs_by_pk(id: $id) { ${JOB_FIELDS} } }`, { id });
  return data.bulk_jobs_by_pk;
}

const FINAL = ['completed', 'partial', 'failed', 'cancelled'];

export async function settledJob(id: string, timeoutMs = 60000): Promise<BulkJob> {
  return waitFor(() => bulkJob(id), (j) => FINAL.includes(j.status), timeoutMs);
}

export async function jobRows(id: string): Promise<BulkRow[]> {
  const data = await asAdmin().request<{ bulk_job_rows: BulkRow[] }>(
    `query ($id: uuid!) { bulk_job_rows(where: { bulk_job_id: { _eq: $id } }, order_by: { row_no: asc }) { ${ROW_FIELDS} } }`,
    { id },
  );
  return data.bulk_job_rows;
}

export async function callJobFn(client: HasuraClient, name: string, job: string): Promise<BulkJob[]> {
  const data = await client.request<Record<string, BulkJob[]>>(`mutation ($j: uuid!) { ${name}(args: { p_job: $j }) { ${JOB_FIELDS} } }`, { j: job });
  return data[name];
}

/** The resume_bulk_jobs cron run in-process for the given organizations only (the dev database is shared). */
export async function runResumeCron(orgIds: string[], scheduledTime = new Date().toISOString()): Promise<Record<string, unknown>> {
  const admin = asAdmin();
  const scoped: HasuraClient = {
    request: async <T>(query: string, variables?: Record<string, unknown>) => {
      const data = await admin.request<T>(query, variables);
      const list = (data as { due_bulk_jobs?: { organization_id: string }[] }).due_bulk_jobs;
      if (list) (data as Record<string, unknown>).due_bulk_jobs = list.filter((r) => orgIds.includes(r.organization_id));
      return data;
    },
  };
  const id = randomUUID();
  const result = await resumeBulkJobs.handle(
    { id, name: 'resume_bulk_jobs', scheduled_time: scheduledTime, payload: {}, comment: null },
    { env: testEnv(), admin: scoped, idempotencyKey: `resume_bulk_jobs:${id}` },
  );
  return { ...result };
}
