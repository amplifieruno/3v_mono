import { randomUUID } from 'node:crypto';
import type { HasuraClient } from '../../../src/hasura/client.js';
import { runReportSchedules } from '../../../src/reports/schedules.js';
import { createStorageClient } from '../../../src/storage/storageClient.js';
import { asAdmin, testEnv } from './clients.js';
import { insertOne } from './operations.js';
import { waitFor } from './sending.js';
import { runSqlRows } from './sql.js';

/** Reports (slice 7, task 2): rows, metrics, files and the schedule cron run in-process. */

export type Report = {
  id: string;
  code: string;
  status: string;
  report_type: string;
  format: string;
  title: string;
  file_id: string | null;
  summary: { row_count?: number; truncated?: boolean; file_name?: string; items?: { label: string; value: unknown }[] } | null;
  error: string | null;
  attempts: number;
  generated_at: string | null;
  start_date: string | null;
  end_date: string | null;
  schedule_id: string | null;
  template_id: string | null;
  incident_id: string | null;
};
export const REPORT_FIELDS = `id code status report_type format title file_id summary error attempts generated_at start_date
  end_date schedule_id template_id incident_id`;

export type Metric = { metric_name: string; metric_type: string; value: number; unit: string | null; category: string | null; dimension: Record<string, unknown> };

export async function createReport(a: HasuraClient, object: Record<string, unknown>): Promise<Report> {
  return insertOne<Report>(a, 'reports', { title: `Report ${randomUUID().slice(0, 8)}`, ...object }, REPORT_FIELDS);
}

export async function report(id: string): Promise<Report> {
  const data = await asAdmin().request<{ reports_by_pk: Report }>(`query($id: uuid!) { reports_by_pk(id: $id) { ${REPORT_FIELDS} } }`, { id });
  return data.reports_by_pk;
}

/** Waits until the report leaves queued/generating (the render_report trigger runs in the backend container). */
export async function settled(id: string, timeoutMs = 30000): Promise<Report> {
  return waitFor(() => report(id), (r) => r.status === 'completed' || r.status === 'failed', timeoutMs);
}

export async function metrics(id: string): Promise<Metric[]> {
  const data = await asAdmin().request<{ report_metrics: Metric[] }>(
    `query($id: uuid!) { report_metrics(where: {report_id: {_eq: $id}}, order_by: [{metric_name: asc}, {created_at: asc}]) {
      metric_name metric_type value unit category dimension } }`,
    { id },
  );
  return data.report_metrics.map((m) => ({ ...m, value: Number(m.value) }));
}

/** Value of the metric without a dimension (the report-wide figure). */
export function metric(rows: Metric[], name: string): number | undefined {
  return rows.find((m) => m.metric_name === name && Object.keys(m.dimension).length === 0)?.value;
}

export type StoredFile = { id: string; bucketId: string; name: string; mimeType: string; metadata: Record<string, unknown> | null };

export async function storedFile(id: string): Promise<StoredFile | null> {
  const data = await asAdmin().request<{ file: StoredFile | null }>(
    `query($id: uuid!) { file(id: $id) { id bucketId name mimeType metadata } }`,
    { id },
  );
  return data.file;
}

/** Files in the organization bucket uploaded for a report (metadata.report_id). */
export async function reportFiles(orgId: string, reportId: string): Promise<string[]> {
  const rows = await runSqlRows(
    `SELECT id FROM storage.files WHERE bucket_id = '${orgId}' AND metadata ->> 'report_id' = '${reportId}'`,
  );
  return rows.map((r) => r.id ?? '');
}

export async function download(fileId: string): Promise<Buffer> {
  return createStorageClient(testEnv()).download(fileId);
}

export async function callReportFn(a: HasuraClient, name: string, args: Record<string, unknown>): Promise<Report[]> {
  const data = await a.request<Record<string, Report[]>>(
    `mutation($args: ${name}_args!) { ${name}(args: $args) { ${REPORT_FIELDS} } }`,
    { args },
  );
  return data[name];
}

/**
 * The `run_report_schedules` cron handler run in-process for the given organizations only (the dev database is shared
 * with the demo seed): due schedules and due reports of other organizations are filtered out.
 */
export async function runScheduleCron(orgIds: string[], scheduledTime: string, id: string = randomUUID()): Promise<Record<string, unknown>> {
  const admin = asAdmin();
  const scoped: HasuraClient = {
    request: async <T>(query: string, variables?: Record<string, unknown>) => {
      const data = await admin.request<T>(query, variables);
      for (const key of ['report_schedules', 'due_reports'] as const) {
        const list = (data as Record<string, { organization_id: string }[] | undefined>)[key];
        if (list) (data as Record<string, unknown>)[key] = list.filter((r) => orgIds.includes(r.organization_id));
      }
      return data;
    },
  };
  const result = await runReportSchedules.handle(
    { id, name: 'run_report_schedules', scheduled_time: scheduledTime, payload: {}, comment: null },
    { env: testEnv(), admin: scoped, idempotencyKey: `run_report_schedules:${id}` },
  );
  return { ...result };
}
