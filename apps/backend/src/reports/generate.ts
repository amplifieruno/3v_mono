import { HasuraError, type HasuraClient } from '../hasura/client.js';
import type { StorageClient } from '../storage/storageClient.js';
import { REPORT_FORMATS, reportDatasetSchema, type ReportFormat } from './dataset.js';
import { renderReportFile } from './render/index.js';

export interface ReportDeps {
  admin: HasuraClient;
  storage: StorageClient;
}

export type ReportResult =
  | { report_id: string; skipped: 'not_claimed' | 'superseded' }
  | { report_id: string; status: 'completed' }
  | { report_id: string; status: 'failed'; error: string };

const CLAIM = `
  mutation ClaimReport($id: uuid!) {
    claim_report(args: { p_report: $id }) { id organization_id attempts format code }
  }
`;
const COMPUTE = `
  mutation ComputeReport($id: uuid!, $attempt: Int!) {
    compute_report(args: { p_report: $id, p_attempt: $attempt }) { dataset }
  }
`;
const COMPLETE = `
  mutation CompleteReport($id: uuid!, $attempt: Int!, $file: uuid!, $summary: jsonb!) {
    complete_report(args: { p_report: $id, p_attempt: $attempt, p_file: $file, p_summary: $summary }) { id status }
  }
`;
const FAIL = `
  mutation FailReport($id: uuid!, $attempt: Int!, $error: String!) {
    fail_report(args: { p_report: $id, p_attempt: $attempt, p_error: $error }) { id status }
  }
`;

type Claimed = { id: string; organization_id: string; attempts: number; format: string; code: string };

function errorText(error: unknown): string {
  if (error instanceof HasuraError && error.detail) return error.detail.slice(0, 1000);
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

function isFormat(value: string): value is ReportFormat {
  return (REPORT_FORMATS as readonly string[]).includes(value);
}

/**
 * Generates one report (spec §8.4 render_report): claim (queued, or generating with an expired lease; attempts + 1),
 * compute the dataset and report_metrics in SQL, render the file, upload it to the organization bucket (kind
 * `report`), then complete guarded by the attempt (event `report_generated`, schedule deliveries). Any failure after
 * the claim deletes an uploaded file and records `failed` with the error; when even that cannot be recorded the error
 * propagates (the trigger retries; the lease lets the cron reclaim the report). A completion refused because a newer
 * attempt owns the report deletes this attempt's file.
 */
export async function generateReport(id: string, deps: ReportDeps): Promise<ReportResult> {
  const { claim_report: rows } = await deps.admin.request<{ claim_report: Claimed[] }>(CLAIM, { id });
  const report = rows[0];
  if (!report) return { report_id: id, skipped: 'not_claimed' };
  const attempt = report.attempts;
  let fileId: string | undefined;
  try {
    const { compute_report: computed } = await deps.admin.request<{ compute_report: { dataset: unknown }[] }>(COMPUTE, {
      id,
      attempt,
    });
    const dataset = reportDatasetSchema.parse(computed[0]?.dataset);
    if (!isFormat(report.format)) throw new Error(`Unsupported report format: ${report.format}`);
    const file = renderReportFile(dataset, report.format);
    const name = `${report.code}.${file.extension}`;
    fileId = (
      await deps.storage.upload({
        bucketId: report.organization_id.toLowerCase(),
        name,
        mimeType: file.mimeType,
        data: file.data,
        metadata: { kind: 'report', report_id: id },
      })
    ).id;
    const summary = {
      row_count: dataset.rows.length,
      truncated: dataset.truncated,
      file_name: name,
      size_bytes: file.data.length,
      items: dataset.summary,
    };
    const { complete_report: done } = await deps.admin.request<{ complete_report: { id: string }[] }>(COMPLETE, {
      id,
      attempt,
      file: fileId,
      summary,
    });
    if (done.length === 0) {
      await deps.storage.deleteFile(fileId).catch(() => undefined);
      return { report_id: id, skipped: 'superseded' };
    }
    return { report_id: id, status: 'completed' };
  } catch (error: unknown) {
    if (fileId) await deps.storage.deleteFile(fileId).catch(() => undefined);
    const message = errorText(error);
    await deps.admin.request(FAIL, { id, attempt, error: message });
    return { report_id: id, status: 'failed', error: message };
  }
}
