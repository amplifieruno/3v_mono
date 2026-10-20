import type { HasuraClient } from '../hasura/client.js';
import { errorText } from '../reports/generate.js';
import { drainFileDeletions } from '../retention/fileQueue.js';
import type { StorageClient } from '../storage/storageClient.js';
import { buildExportArchive } from './exportBundle.js';

/**
 * The fulfil_dsr job (spec §8.4, slice 10 task 3): claim the request (lease, attempt + 1), then by type —
 * access / portability: bundle (SQL) -> zip with the files -> upload (kind dsr_export, sensitive) -> complete (rejected
 * with subject_erased when the person was erased meanwhile: the upload is deleted);
 * erasure: itap.dsr_erase_restrict (committed), then itap.dsr_erase in one transaction, then the storage deletion
 * queue is drained;
 * restriction: itap.dsr_restrict; rectification: itap.dsr_await_rectification (org_admin applies and closes it).
 * Every SQL writer takes the attempt (a stale attempt is a no-op). A failure records the error with a backoff lease
 * (fail_dsr; the dsr_maintenance cron reclaims it) and deletes this attempt's upload; when even that cannot be
 * recorded the error propagates (Hasura retries the delivery).
 */

export interface DsrDeps {
  admin: HasuraClient;
  storage: StorageClient;
  now?: () => Date;
}

export type DsrResult =
  | { request_id: string; skipped: 'not_claimed' | 'superseded' }
  | { request_id: string; status: string; partial?: boolean }
  | { request_id: string; status: 'failed'; error: string };

type Claimed = { id: string; organization_id: string; code: string; request_type: string; attempts: number };
type Row = { id: string; status: string; partial: boolean };

const ROW = 'id status partial';
const CLAIM = `
  mutation ClaimDsr($id: uuid!) { claim_dsr(args: { p_request: $id }) { id organization_id code request_type attempts } }
`;
const FAIL = `
  mutation FailDsr($id: uuid!, $attempt: Int!, $error: String!) {
    fail_dsr(args: { p_request: $id, p_attempt: $attempt, p_error: $error }) { id }
  }
`;
const BUNDLE = `
  mutation DsrBundle($id: uuid!, $attempt: Int!) { dsr_bundle(args: { p_request: $id, p_attempt: $attempt }) { bundle } }
`;
const COMPLETE_EXPORT = `
  mutation CompleteDsrExport($id: uuid!, $attempt: Int!, $file: uuid!, $summary: jsonb!) {
    complete_dsr_export(args: { p_request: $id, p_attempt: $attempt, p_file: $file, p_summary: $summary }) { ${ROW} }
  }
`;
const LEFTOVER_FILES = `
  query DsrLeftoverFiles($bucket: String!, $meta: jsonb!) {
    files(where: { bucketId: { _eq: $bucket }, metadata: { _contains: $meta } }) { id }
  }
`;
const EXPORT_FILE = `query DsrExportFile($id: uuid!) { data_subject_requests_by_pk(id: $id) { export_file_id } }`;
const FILE_EXISTS = `query DsrFileExists($id: uuid!) { file(id: $id) { id } }`;

/** One fenced job function `fn(p_request, p_attempt)` returning the request row (or none when superseded). */
const STEP = (fn: string): string => `
  mutation DsrStep($id: uuid!, $attempt: Int!) { ${fn}(args: { p_request: $id, p_attempt: $attempt }) { ${ROW} } }
`;
const STEP_FUNCTIONS: Record<string, string> = {
  erasure: 'dsr_erase',
  restriction: 'dsr_restrict',
  rectification: 'dsr_await_rectification',
};

/** Files earlier attempts uploaded but never attached (tagged with the request). Best effort. */
async function sweepLeftovers(r: Claimed, deps: DsrDeps): Promise<void> {
  try {
    const { files } = await deps.admin.request<{ files: { id: string }[] }>(LEFTOVER_FILES, {
      bucket: r.organization_id.toLowerCase(),
      meta: { dsr_id: r.id },
    });
    for (const f of files) await deps.storage.deleteFile(f.id).catch(() => undefined);
  } catch {
    // The next attempt sweeps again.
  }
}

async function runExport(r: Claimed, deps: DsrDeps, uploaded: (id: string) => void): Promise<Row | null> {
  const { dsr_bundle: rows } = await deps.admin.request<{ dsr_bundle: { bundle: unknown }[] }>(BUNDLE, {
    id: r.id,
    attempt: r.attempts,
  });
  if (!rows[0]) return null;
  const exists = async (fileId: string): Promise<boolean> =>
    (await deps.admin.request<{ file: { id: string } | null }>(FILE_EXISTS, { id: fileId })).file !== null;
  const archive = await buildExportArchive(rows[0].bundle, deps.storage, exists);
  const { id: file } = await deps.storage.upload({
    bucketId: r.organization_id.toLowerCase(),
    name: `${r.code}.zip`,
    mimeType: 'application/zip',
    data: archive.data,
    metadata: { kind: 'dsr_export', dsr_id: r.id },
  });
  uploaded(file);
  const summary = { files: archive.files, missing_files: archive.missing.length, size_bytes: archive.data.length };
  const { complete_dsr_export: done } = await deps.admin.request<{ complete_dsr_export: Row[] }>(COMPLETE_EXPORT, {
    id: r.id,
    attempt: r.attempts,
    file,
    summary,
  });
  // Superseded, or rejected because the subject was erased meanwhile (SQL queued the zip; deleted now).
  if (!done[0] || done[0].status === 'rejected') await deps.storage.deleteFile(file).catch(() => undefined);
  return done[0] ?? null;
}

async function callStep(fn: string, r: Claimed, deps: DsrDeps): Promise<Row | null> {
  const data = await deps.admin.request<Record<string, Row[]>>(STEP(fn), { id: r.id, attempt: r.attempts });
  return data[fn]?.[0] ?? null;
}

async function runStep(r: Claimed, deps: DsrDeps): Promise<Row | null> {
  const fn = STEP_FUNCTIONS[r.request_type];
  if (!fn) throw new Error(`Unsupported request type: ${r.request_type}`);
  // Erasure: the restriction is committed first (processing stops even if the erasure itself fails and retries).
  if (r.request_type === 'erasure' && !(await callStep('dsr_erase_restrict', r, deps))) return null;
  const row = await callStep(fn, r, deps);
  // Erasure queued the person's files: delete them through the storage API now (the 10-minute cron is the net).
  if (row && r.request_type === 'erasure') {
    await drainFileDeletions(deps.admin, deps.storage, (deps.now ?? (() => new Date()))()).catch(() => undefined);
  }
  return row;
}

export async function fulfilDsr(id: string, deps: DsrDeps): Promise<DsrResult> {
  const { claim_dsr: claimed } = await deps.admin.request<{ claim_dsr: Claimed[] }>(CLAIM, { id });
  const r = claimed[0];
  if (!r) return { request_id: id, skipped: 'not_claimed' };
  const isExport = r.request_type === 'access' || r.request_type === 'portability';
  if (isExport) await sweepLeftovers(r, deps);
  let fileId: string | undefined;
  try {
    const row = isExport ? await runExport(r, deps, (f) => (fileId = f)) : await runStep(r, deps);
    if (!row) return { request_id: id, skipped: 'superseded' };
    return { request_id: id, status: row.status, ...(r.request_type === 'erasure' ? { partial: row.partial } : {}) };
  } catch (error: unknown) {
    const message = errorText(error);
    const { fail_dsr: failed } = await deps.admin.request<{ fail_dsr: { id: string }[] }>(FAIL, {
      id,
      attempt: r.attempts,
      error: message,
    });
    if (fileId) {
      // Keep the file only when it is the request's export (a completion whose answer was lost).
      const owned =
        failed.length === 0 &&
        (await deps.admin.request<{ data_subject_requests_by_pk: { export_file_id: string | null } | null }>(EXPORT_FILE, { id }))
          .data_subject_requests_by_pk?.export_file_id === fileId;
      if (!owned) await deps.storage.deleteFile(fileId).catch(() => undefined);
    }
    if (failed.length === 0) return { request_id: id, skipped: 'superseded' };
    return { request_id: id, status: 'failed', error: message };
  }
}
