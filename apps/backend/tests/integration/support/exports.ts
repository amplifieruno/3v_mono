import { randomUUID } from 'node:crypto';
import type { HasuraClient } from '../../../src/hasura/client.js';
import { runExportDefinitions } from '../../../src/exports/handlers.js';
import { createStorageClient } from '../../../src/storage/storageClient.js';
import { asAdmin, testEnv } from './clients.js';
import { insertOne } from './operations.js';
import { waitFor } from './sending.js';

/** Export definitions and jobs (slice 10 task 4). */

export type Definition = {
  id: string;
  code: string;
  entity: string;
  mode: string;
  watermark: string | null;
  owner_id: string;
  next_run_at: string | null;
  last_error: string | null;
};
export const DEFINITION_FIELDS = 'id code entity mode watermark owner_id next_run_at last_error';

export type ExportJob = {
  id: string;
  definition_id: string;
  trigger: string;
  status: string;
  entity: string;
  format: string;
  file_id: string | null;
  row_count: number | null;
  truncated: boolean;
  requested_by: string;
  watermark_from: string | null;
  watermark_to: string | null;
  error: string | null;
  attempts: number;
};
export const JOB_FIELDS = `id definition_id trigger status entity format file_id row_count truncated requested_by watermark_from
  watermark_to error attempts`;

export async function createDefinition(a: HasuraClient, object: Record<string, unknown>): Promise<Definition> {
  return insertOne<Definition>(a, 'export_definitions', { name: `Export ${randomUUID().slice(0, 8)}`, ...object }, DEFINITION_FIELDS);
}

export async function definition(id: string): Promise<Definition> {
  const data = await asAdmin().request<{ export_definitions_by_pk: Definition }>(
    `query($id: uuid!) { export_definitions_by_pk(id: $id) { ${DEFINITION_FIELDS} } }`,
    { id },
  );
  return data.export_definitions_by_pk;
}

export async function requestExport(a: HasuraClient, definitionId: string): Promise<ExportJob> {
  return insertOne<ExportJob>(a, 'export_jobs', { definition_id: definitionId }, JOB_FIELDS);
}

export async function exportJob(id: string): Promise<ExportJob> {
  const data = await asAdmin().request<{ export_jobs_by_pk: ExportJob }>(`query($id: uuid!) { export_jobs_by_pk(id: $id) { ${JOB_FIELDS} } }`, { id });
  return data.export_jobs_by_pk;
}

/** Waits until the job is completed or failed (the run_export trigger runs in the backend container). */
export async function settledJob(id: string, timeoutMs = 30000): Promise<ExportJob> {
  return waitFor(() => exportJob(id), (j) => j.status === 'completed' || j.status === 'failed', timeoutMs);
}

/** Requests an export and waits for its outcome. */
export async function exportNow(a: HasuraClient, definitionId: string): Promise<ExportJob> {
  return settledJob((await requestExport(a, definitionId)).id);
}

export async function fileText(fileId: string): Promise<string> {
  return (await createStorageClient(testEnv()).download(fileId)).toString('utf8');
}

/** Rows of a JSON export file. */
export async function jsonRows(fileId: string): Promise<Record<string, unknown>[]> {
  const doc = JSON.parse(await fileText(fileId)) as { rows: Record<string, unknown>[] };
  return doc.rows;
}

/** The run_export_definitions cron handler in-process, restricted to the given organizations. */
export async function runExportCron(orgIds: string[], scheduledTime: string): Promise<Record<string, unknown>> {
  const admin = asAdmin();
  const scoped: HasuraClient = {
    request: async <T>(query: string, variables?: Record<string, unknown>) => {
      const data = await admin.request<T>(query, variables);
      for (const key of ['export_definitions', 'due_export_jobs'] as const) {
        const list = (data as Record<string, { organization_id: string }[] | undefined>)[key];
        if (list) (data as Record<string, unknown>)[key] = list.filter((r) => orgIds.includes(r.organization_id));
      }
      return data;
    },
  };
  const id = randomUUID();
  const result = await runExportDefinitions.handle(
    { id, name: 'run_export_definitions', scheduled_time: scheduledTime, payload: {}, comment: null },
    { env: testEnv(), admin: scoped, idempotencyKey: `run_export_definitions:${id}` },
  );
  return { ...result };
}
