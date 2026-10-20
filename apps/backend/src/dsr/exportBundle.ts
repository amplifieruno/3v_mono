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

export type ExportArchive = { data: Buffer; files: number; missing: string[] };

export async function buildExportArchive(bundle: unknown, storage: StorageClient): Promise<ExportArchive> {
  const parsed = bundleSchema.parse(bundle);
  const entries: ZipFile[] = [];
  const missing: string[] = [];
  for (const file of parsed.files) {
    try {
      entries.push({ name: file.path, data: await storage.download(file.file_id) });
    } catch (error: unknown) {
      // A file deleted meanwhile is reported in the bundle; any other storage failure retries the job.
      if (error instanceof StorageError && error.status === 404) {
        missing.push(file.file_id);
        continue;
      }
      throw error;
    }
  }
  const json = Buffer.from(JSON.stringify({ ...parsed, missing_files: missing }, null, 2), 'utf8');
  return { data: zip([{ name: 'bundle.json', data: json }, ...entries]), files: entries.length, missing };
}
