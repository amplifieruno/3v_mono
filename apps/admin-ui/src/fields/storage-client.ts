import { useCallback, useMemo } from 'react';
import { useConsole } from '../app/console-context';
import { STORAGE_BASE } from '../data/endpoints';

/** A refused or failed storage request: the HTTP status and the server's message, if any. */
export class StorageRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'StorageRequestError';
    this.status = status;
  }
}

/**
 * Where storage requests go and which token they carry: in the console the
 * same-origin proxy and the runtime's auth provider (`useStorageTarget`); the
 * dev-stack tests pass the storage URL and their own session.
 */
export interface StorageTarget {
  readonly base: string;
  readonly getToken: () => Promise<string | null>;
}

async function authHeaders(target: StorageTarget): Promise<Record<string, string>> {
  const token = await target.getToken();
  if (!token) throw new StorageRequestError(401, 'Not signed in to an organization.');
  return { Authorization: `Bearer ${token}` };
}

/** hasura-storage's error body is `{ error: { message } }`; anything else yields no message. */
async function errorOf(res: Response): Promise<StorageRequestError> {
  const body: unknown = await res.json().catch(() => null);
  const error =
    typeof body === 'object' && body !== null ? (body as { error?: { message?: unknown } }).error : undefined;
  const message = typeof error?.message === 'string' ? error.message : '';
  return new StorageRequestError(res.status, message);
}

/**
 * Uploads one file to hasura-storage (`POST /v1/files`, multipart `bucket-id`,
 * `metadata[]` = `{ name, metadata: { kind } }`, `file[]`) with the
 * organization token, so the `storage.files` insert permission of `org_admin`
 * decides. Answers the new file id.
 */
export async function uploadStorageFile(
  file: File,
  meta: { readonly bucket: string; readonly kind: string },
  target: StorageTarget,
): Promise<{ id: string }> {
  const form = new FormData();
  form.append('bucket-id', meta.bucket);
  form.append('metadata[]', JSON.stringify({ name: file.name, metadata: { kind: meta.kind } }));
  form.append('file[]', file, file.name);
  const res = await fetch(`${target.base}/v1/files`, {
    method: 'POST',
    headers: await authHeaders(target),
    body: form,
  });
  if (!res.ok) throw await errorOf(res);
  const json = (await res.json()) as { processedFiles?: { id?: string }[] };
  const id = json.processedFiles?.[0]?.id;
  if (!id) throw new StorageRequestError(res.status, '');
  return { id };
}

/** A short-lived download URL of a non-sensitive file (`GET /v1/files/{id}/presignedurl`). */
export async function presignStorageFile(
  fileId: string,
  target: StorageTarget,
): Promise<{ url: string; expiresAt: number }> {
  const res = await fetch(`${target.base}/v1/files/${encodeURIComponent(fileId)}/presignedurl`, {
    headers: await authHeaders(target),
  });
  if (!res.ok) throw await errorOf(res);
  const json = (await res.json()) as { url?: string; expiration?: number };
  if (!json.url) throw new StorageRequestError(res.status, '');
  return { url: json.url, expiresAt: Date.now() + (json.expiration ?? 60) * 1000 };
}

/** The console's storage target: the proxy path and the token of the `<AppRuntime>`'s auth provider. */
export function useStorageTarget(): StorageTarget {
  const { auth } = useConsole();
  return useMemo(() => ({ base: STORAGE_BASE, getToken: () => auth.getToken() }), [auth]);
}

/** The upload function the storage file input uses; reads the organization token per call. */
export function useStorageUpload(): (
  file: File,
  meta: { bucket: string; kind: string },
) => Promise<{ id: string }> {
  const target = useStorageTarget();
  return useCallback((file, meta) => uploadStorageFile(file, meta, target), [target]);
}
