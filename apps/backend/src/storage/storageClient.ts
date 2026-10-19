import type { Env } from '../config/env.js';
import { mapAbort } from '../http/abort.js';

/** `metadata.kind` values whose access is audited (`open_file`) and which org_admin cannot select directly. */
export const SENSITIVE_FILE_KINDS: ReadonlySet<string> = new Set(['profile_document', 'dsr_export', 'auth_capture']);

/**
 * `metadata.kind` values whose opening through `open_file` is audited (`view_sensitive`): the sensitive kinds plus
 * generated reports (aggregated personal data: attendance, incident timelines). Reports stay selectable by org_admin.
 */
export const AUDITED_FILE_KINDS: ReadonlySet<string> = new Set([...SENSITIVE_FILE_KINDS, 'report']);

/**
 * `metadata.kind` values visible to their uploader only (`uploaded_by_user_id`, preset from the session on upload):
 * search images, bulk job input files and bulk search results (the job owner becomes their uploader). Enforced by the
 * storage.files select permission, open_file / delete_file, enrollment photo sources, the search service and SQL
 * (`itap.owner_only_file_kinds()`).
 */
export const OWNER_ONLY_FILE_KINDS: ReadonlySet<string> = new Set(['search', 'bulk_input', 'bulk_search_result']);

export type StorageClient = {
  presignedUrl(fileId: string): Promise<{ url: string; expiresAt: Date }>;
  deleteFile(fileId: string): Promise<void>;
  /** Downloads a file's content. */
  download(fileId: string): Promise<Buffer>;
  upload(input: {
    bucketId: string;
    name: string;
    mimeType: string;
    data: Buffer;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string }>;
};

export class StorageError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'StorageError';
    this.status = status;
  }
}

/** Status reported by a StorageError for a request that timed out (no HTTP status was received, or only headers). */
export const STORAGE_TIMEOUT_STATUS = 504;

/** Default per-request limit when the env does not set STORAGE_TIMEOUT_MS. */
export const DEFAULT_STORAGE_TIMEOUT_MS = 30_000;

export type StorageClientOptions = {
  /** Per-request limit (connect + body read); defaults to env STORAGE_TIMEOUT_MS. */
  timeoutMs?: number;
};

/** hasura-storage 0.7 client authenticated with the admin secret (bypasses bucket permissions). */
export function createStorageClient(env: Env, options: StorageClientOptions = {}): StorageClient {
  const base = env.NHOST_STORAGE_URL.replace(/\/+$/, '');
  const headers = { 'x-hasura-admin-secret': env.GRAPHQL_ADMIN_SECRET };
  const timeoutMs = options.timeoutMs ?? env.STORAGE_TIMEOUT_MS ?? DEFAULT_STORAGE_TIMEOUT_MS;

  /**
   * One request under one timeout signal. `read` consumes the body (or fails on a non-2xx answer); a timeout while
   * connecting or reading becomes a StorageError (status 504, or the received status), never a raw DOMException.
   */
  async function call<T>(what: string, path: string, init: RequestInit, read: (res: Response) => Promise<T>): Promise<T> {
    const timedOut = (status: number) => () => new StorageError(`${what} timed out after ${timeoutMs} ms`, status);
    const signal = AbortSignal.timeout(timeoutMs);
    const res = await mapAbort(fetch(`${base}${path}`, { ...init, headers, signal }), timedOut(STORAGE_TIMEOUT_STATUS));
    if (!res.ok) {
      const text = await mapAbort(res.text(), timedOut(res.status)).catch((error: unknown) => {
        if (error instanceof StorageError) throw error;
        return '';
      });
      throw new StorageError(`${what} failed (${res.status}): ${text.slice(0, 200)}`, res.status);
    }
    return mapAbort(read(res), timedOut(STORAGE_TIMEOUT_STATUS));
  }

  return {
    async presignedUrl(fileId) {
      // `expiration` is the lifetime in seconds.
      const body = await call('Presigned URL request', `/files/${encodeURIComponent(fileId)}/presignedurl`, {}, (res) =>
        res.json() as Promise<{ url: string; expiration: number }>,
      );
      return { url: body.url, expiresAt: new Date(Date.now() + body.expiration * 1000) };
    },

    async deleteFile(fileId) {
      await call('File delete', `/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' }, async () => undefined);
    },

    async download(fileId) {
      return call('File download', `/files/${encodeURIComponent(fileId)}`, {}, async (res) =>
        Buffer.from(await res.arrayBuffer()),
      );
    },

    async upload({ bucketId, name, mimeType, data, metadata }) {
      const form = new FormData();
      form.append('bucket-id', bucketId);
      form.append('metadata[]', JSON.stringify({ name, ...(metadata ? { metadata } : {}) }));
      form.append('file[]', new Blob([new Uint8Array(data)], { type: mimeType }), name);
      const { status, body } = await call('File upload', '/files', { method: 'POST', body: form }, async (res) => ({
        status: res.status,
        body: (await res.json()) as { processedFiles?: { id: string }[] },
      }));
      const id = body.processedFiles?.[0]?.id;
      if (!id) throw new StorageError('File upload returned no processed file', status);
      return { id };
    },
  };
}
