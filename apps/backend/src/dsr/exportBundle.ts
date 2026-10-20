import { z } from 'zod';
import { zip, type ZipFile } from '../reports/render/zip.js';
import { StorageError, type StorageClient } from '../storage/storageClient.js';

/**
 * Access / portability export (GDPR Art. 15 / 20): `bundle.json` (the SQL bundle of itap.dsr_bundle plus the ids of
 * files that no longer exist in storage) followed by every referenced file at its bundle path, zipped with the
 * in-house writer (slice 7).
 */

const bundleSchema = z
  .object({
    files: z.array(z.object({ file_id: z.string().min(1), path: z.string().min(1) })),
  })
  .passthrough();

/** Whether the storage row of a file still exists (a 500 is then not a confirmed absence). */
export type FileExists = (fileId: string) => Promise<boolean>;

/**
 * A file deleted meanwhile (404) is missing: null. hasura-storage answers 500 for a storage row whose object is gone
 * and transiently while a file is being deleted: retried once, then the storage row is checked — a file whose row
 * is gone is missing, otherwise the error propagates and the job retries. Any other failure (timeouts, ...)
 * propagates as well.
 */
async function downloadOrMissing(storage: StorageClient, fileId: string, exists: FileExists): Promise<Buffer | null> {
  let last: StorageError | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await storage.download(fileId);
    } catch (error: unknown) {
      if (!(error instanceof StorageError)) throw error;
      if (error.status === 404) return null;
      if (error.status !== 500) throw error;
      last = error;
    }
  }
  if (await exists(fileId)) throw last;
  return null;
}

export type ExportArchive = { data: Buffer; files: number; missing: string[] };

export async function buildExportArchive(bundle: unknown, storage: StorageClient, exists: FileExists): Promise<ExportArchive> {
  const parsed = bundleSchema.parse(bundle);
  const entries: ZipFile[] = [];
  const missing: string[] = [];
  for (const file of parsed.files) {
    const data = await downloadOrMissing(storage, file.file_id, exists);
    if (data) entries.push({ name: file.path, data });
    else missing.push(file.file_id);
  }
  const json = Buffer.from(JSON.stringify({ ...parsed, missing_files: missing }, null, 2), 'utf8');
  return { data: zip([{ name: 'bundle.json', data: json }, ...entries]), files: entries.length, missing };
}
