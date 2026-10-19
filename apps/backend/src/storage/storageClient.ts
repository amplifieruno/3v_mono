import type { Env } from '../config/env.js';

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

async function fail(res: Response, what: string): Promise<never> {
  const text = await res.text().catch(() => '');
  throw new StorageError(`${what} failed (${res.status}): ${text.slice(0, 200)}`, res.status);
}

/** hasura-storage 0.7 client authenticated with the admin secret (bypasses bucket permissions). */
export function createStorageClient(env: Env): StorageClient {
  const base = env.NHOST_STORAGE_URL.replace(/\/+$/, '');
  const headers = { 'x-hasura-admin-secret': env.GRAPHQL_ADMIN_SECRET };

  return {
    async presignedUrl(fileId) {
      const res = await fetch(`${base}/files/${encodeURIComponent(fileId)}/presignedurl`, { headers });
      if (!res.ok) return fail(res, 'Presigned URL request');
      // `expiration` is the lifetime in seconds.
      const body = (await res.json()) as { url: string; expiration: number };
      return { url: body.url, expiresAt: new Date(Date.now() + body.expiration * 1000) };
    },

    async deleteFile(fileId) {
      const res = await fetch(`${base}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE', headers });
      if (!res.ok) return fail(res, 'File delete');
    },

    async download(fileId) {
      const res = await fetch(`${base}/files/${encodeURIComponent(fileId)}`, { headers });
      if (!res.ok) return fail(res, 'File download');
      return Buffer.from(await res.arrayBuffer());
    },

    async upload({ bucketId, name, mimeType, data, metadata }) {
      const form = new FormData();
      form.append('bucket-id', bucketId);
      form.append('metadata[]', JSON.stringify({ name, ...(metadata ? { metadata } : {}) }));
      form.append('file[]', new Blob([new Uint8Array(data)], { type: mimeType }), name);
      const res = await fetch(`${base}/files`, { method: 'POST', headers, body: form });
      if (!res.ok) return fail(res, 'File upload');
      const body = (await res.json()) as { processedFiles?: { id: string }[] };
      const id = body.processedFiles?.[0]?.id;
      if (!id) throw new StorageError('File upload returned no processed file', res.status);
      return { id };
    },
  };
}
