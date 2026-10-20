import { signOrgToken } from '../auth/hasuraJwt.js';
import type { Env } from '../config/env.js';
import { createHasuraTokenClient, type HasuraClient } from '../hasura/client.js';
import { errorText } from '../reports/generate.js';
import type { StorageClient } from '../storage/storageClient.js';
import { baseWhere, ExportFailure, fetchRows, readableColumns, validateFilters } from './query.js';
import { isExportFormat, renderExport } from './render.js';

/**
 * The run_export job (spec §8.4, slice 10 task 4): claim the job (lease, attempt + 1), then query Hasura AS THE
 * REQUESTING MEMBER with a freshly signed organization token (role org_admin, their user id) — permissions decide rows
 * and columns (Review Focus 4) — validate the filters with a dry query, page through the rows (incremental: after the
 * job's watermark), render (csv / json / xlsx), upload to the organization bucket as kind `export` with the member as
 * the uploader (owner-only, sensitive), and complete (the watermark advances to the last exported row only then).
 * A failure records `failed` (fenced) and deletes this attempt's upload.
 */

export interface ExportDeps {
  env: Env;
  admin: HasuraClient;
  storage: StorageClient;
  /** The member's client; defaults to a bearer client with a signed org token. */
  memberClient?: (organizationId: string, userId: string) => HasuraClient;
  now?: () => Date;
}

export type ExportResult =
  | { job_id: string; skipped: 'not_claimed' | 'superseded' }
  | { job_id: string; status: 'completed'; row_count: number }
  | { job_id: string; status: 'failed'; error: string };

type Claimed = {
  id: string;
  organization_id: string;
  definition_id: string;
  entity: string;
  format: string;
  filters: Record<string, unknown>;
  watermark_from: string | null;
  requested_by: string;
  attempts: number;
};

const JOB = 'id organization_id definition_id entity format filters watermark_from requested_by attempts';
const CLAIM = `mutation ClaimExport($id: uuid!) { claim_export_job(args: { p_job: $id }) { ${JOB} } }`;
const DEFINITION = `query ExportDefinition($id: uuid!) { export_definitions_by_pk(id: $id) { code name } }`;
const SET_UPLOADER = `
  mutation ExportUploader($id: uuid!, $user: uuid!) { updateFile(pk_columns: { id: $id }, _set: { uploadedByUserId: $user }) { id } }
`;
const COMPLETE = `
  mutation CompleteExport($id: uuid!, $attempt: Int!, $file: uuid!, $rows: Int!, $truncated: Boolean!, $watermark: timestamptz) {
    complete_export_job(args: {
      p_job: $id, p_attempt: $attempt, p_file: $file, p_row_count: $rows, p_truncated: $truncated, p_watermark: $watermark
    }) { id }
  }
`;
const FAIL = `
  mutation FailExport($id: uuid!, $attempt: Int!, $error: String!) {
    fail_export_job(args: { p_job: $id, p_attempt: $attempt, p_error: $error }) { id }
  }
`;
const LEFTOVER_FILES = `
  query ExportLeftoverFiles($bucket: String!, $meta: jsonb!) { files(where: { bucketId: { _eq: $bucket }, metadata: { _contains: $meta } }) { id } }
`;

function memberClientFor(env: Env): (organizationId: string, userId: string) => HasuraClient {
  return (organizationId, userId) => {
    const { token } = signOrgToken({ userId, organizationId, role: 'org_admin', ttlSeconds: 900 }, env.HASURA_JWT_SECRET);
    return createHasuraTokenClient(env, token, { timeoutMs: 60_000 });
  };
}

/** Files an earlier attempt of this job uploaded but never attached. Best effort. */
async function sweepLeftovers(job: Claimed, deps: ExportDeps): Promise<void> {
  try {
    const { files } = await deps.admin.request<{ files: { id: string }[] }>(LEFTOVER_FILES, {
      bucket: job.organization_id.toLowerCase(),
      meta: { export_job_id: job.id },
    });
    for (const f of files) await deps.storage.deleteFile(f.id).catch(() => undefined);
  } catch {
    // The next attempt sweeps again.
  }
}

async function produce(job: Claimed, deps: ExportDeps, uploaded: (id: string) => void): Promise<ExportResult> {
  const now = (deps.now ?? (() => new Date()))();
  if (!isExportFormat(job.format)) throw new ExportFailure(`format_not_supported:${job.format}`);
  const member = (deps.memberClient ?? memberClientFor(deps.env))(job.organization_id, job.requested_by);
  const columns = await readableColumns(member, job.entity);
  await validateFilters(member, job.entity, job.filters);
  const result = await fetchRows(member, job.entity, columns, baseWhere(job.entity, job.filters, job.watermark_from, now));
  const { export_definitions_by_pk: d } = await deps.admin.request<{ export_definitions_by_pk: { code: string; name: string } | null }>(
    DEFINITION,
    { id: job.definition_id },
  );
  const meta = { code: d?.code ?? 'EXP', name: d?.name ?? job.entity, entity: job.entity, generatedAt: now.toISOString(), truncated: result.truncated };
  const file = renderExport(job.format, columns, result.rows, meta);
  const fileId = (
    await deps.storage.upload({
      bucketId: job.organization_id.toLowerCase(),
      name: `${meta.code}-${now.toISOString().replace(/[:.]/g, '-')}.${file.extension}`,
      mimeType: file.mimeType,
      data: file.data,
      metadata: { kind: 'export', export_job_id: job.id },
    })
  ).id;
  uploaded(fileId);
  await deps.admin.request(SET_UPLOADER, { id: fileId, user: job.requested_by });
  const { complete_export_job: done } = await deps.admin.request<{ complete_export_job: unknown[] }>(COMPLETE, {
    id: job.id,
    attempt: job.attempts,
    file: fileId,
    rows: result.rows.length,
    truncated: result.truncated,
    watermark: result.lastWatermark,
  });
  if (done.length === 0) {
    await deps.storage.deleteFile(fileId).catch(() => undefined);
    return { job_id: job.id, skipped: 'superseded' };
  }
  return { job_id: job.id, status: 'completed', row_count: result.rows.length };
}

export async function runExport(id: string, deps: ExportDeps): Promise<ExportResult> {
  const { claim_export_job: rows } = await deps.admin.request<{ claim_export_job: Claimed[] }>(CLAIM, { id });
  const job = rows[0];
  if (!job) return { job_id: id, skipped: 'not_claimed' };
  await sweepLeftovers(job, deps);
  let fileId: string | undefined;
  try {
    return await produce(job, deps, (f) => {
      fileId = f;
    });
  } catch (error: unknown) {
    const message = error instanceof ExportFailure ? error.message : errorText(error);
    const { fail_export_job: failed } = await deps.admin.request<{ fail_export_job: unknown[] }>(FAIL, {
      id: job.id,
      attempt: job.attempts,
      error: message,
    });
    if (fileId && failed.length > 0) await deps.storage.deleteFile(fileId).catch(() => undefined);
    return failed.length === 0 ? { job_id: job.id, skipped: 'superseded' } : { job_id: job.id, status: 'failed', error: message };
  }
}
