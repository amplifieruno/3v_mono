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

/**
 * A file deleted meanwhile (404) or a storage row whose object is gone (hasura-storage answers 500; retried once to
 * ride out a transient error) is missing: null. Any other failure (timeouts, ...) propagates and retries the job.
 */
async function downloadOrMissing(storage: StorageClient, fileId: string): Promise<Buffer | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await storage.download(fileId);
    } catch (error: unknown) {
      if (!(error instanceof StorageError)) throw error;
      if (error.status === 404) return null;
      if (error.status !== 500) throw error;
    }
  }
  return null;
}

export type ExportArchive = { data: Buffer; files: number; missing: string[] };

export async function buildExportArchive(bundle: unknown, storage: StorageClient): Promise<ExportArchive> {
  const parsed = bundleSchema.parse(bundle);
  const entries: ZipFile[] = [];
  const missing: string[] = [];
  for (const file of parsed.files) {
    const data = await downloadOrMissing(storage, file.file_id);
    if (data) entries.push({ name: file.path, data });
    else missing.push(file.file_id);
  }
  const json = Buffer.from(JSON.stringify({ ...parsed, missing_files: missing }, null, 2), 'utf8');
  return { data: zip([{ name: 'bundle.json', data: json }, ...entries]), files: entries.length, missing };
}
