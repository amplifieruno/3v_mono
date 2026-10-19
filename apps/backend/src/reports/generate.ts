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
    claim_report(args: { p_report: $id }) { id organization_id attempts format code file_id }
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

const LEFTOVER_FILES = `
  query ReportLeftoverFiles($bucket: String!, $meta: jsonb!) {
    files(where: { bucketId: { _eq: $bucket }, metadata: { _contains: $meta } }) { id }
  }
`;
const REPORT_FILE = `
  query ReportFile($id: uuid!) {
    reports_by_pk(id: $id) { file_id }
  }
`;

type Claimed = { id: string; organization_id: string; attempts: number; format: string; code: string; file_id: string | null };

/**
 * Files an earlier attempt uploaded but never attached (a handler that crashed between upload and completion, or a
 * failed cleanup): every file of the bucket tagged with this report, except the report's own file. Best effort.
 */
async function sweepLeftovers(report: Claimed, deps: ReportDeps): Promise<void> {
  try {
    const { files } = await deps.admin.request<{ files: { id: string }[] }>(LEFTOVER_FILES, {
      bucket: report.organization_id.toLowerCase(),
      meta: { report_id: report.id },
    });
    for (const f of files) {
      if (f.id !== report.file_id) await deps.storage.deleteFile(f.id).catch(() => undefined);
    }
  } catch {
    // The next claim of this report sweeps again.
  }
}

/** Error text for a report / schedule row: the database message when Hasura exposes it, at most 1000 characters. */
export function errorText(error: unknown): string {
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
 * the claim records `failed` with the error (fenced by the attempt number), then deletes this attempt's upload unless
 * it is the report's file (a completion that committed but whose answer was lost); when the failure cannot be recorded
 * the error propagates (the trigger retries; the lease lets the cron reclaim the report, and the next claim sweeps
 * files left by earlier attempts). A completion refused because a newer attempt owns the report deletes this file.
 */
export async function generateReport(id: string, deps: ReportDeps): Promise<ReportResult> {
  const { claim_report: rows } = await deps.admin.request<{ claim_report: Claimed[] }>(CLAIM, { id });
  const report = rows[0];
  if (!report) return { report_id: id, skipped: 'not_claimed' };
  const attempt = report.attempts;
  await sweepLeftovers(report, deps);
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
    const message = errorText(error);
    // Record the failure first; this attempt's file is removed only when it is certainly not the report's file.
    const { fail_report: failed } = await deps.admin.request<{ fail_report: { id: string }[] }>(FAIL, {
      id,
      attempt,
      error: message,
    });
    if (fileId) {
      const owned =
        failed.length === 0 &&
        (await deps.admin.request<{ reports_by_pk: { file_id: string | null } | null }>(REPORT_FILE, { id })).reports_by_pk
          ?.file_id === fileId;
      if (!owned) await deps.storage.deleteFile(fileId).catch(() => undefined);
    }
    // No row: another attempt owns the report, or this attempt's completion committed although its answer was lost.
    if (failed.length === 0) return { report_id: id, skipped: 'superseded' };
    return { report_id: id, status: 'failed', error: message };
  }
}
