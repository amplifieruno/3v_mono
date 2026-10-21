import { z } from 'zod';
import { ORG_LOGOS_BUCKET } from './storage-file';

/** The `meta` a `storageFile(...)` field carries (`./storage-file.ts`). */
export const storageFileMeta = z.object({
  bucket: z.enum(['organization', ORG_LOGOS_BUCKET]),
  kind: z.string().min(1),
  sensitive: z.boolean(),
  accept: z.string().nullable(),
  maxSize: z.number().positive().nullable(),
});

export type StorageFileMeta = z.infer<typeof storageFileMeta>;

/** Whether `file` matches an HTML `accept` list (`image/*`, `.pdf`, `image/png`). */
export function acceptsFile(file: File, accept: string | null): boolean {
  if (accept === null || accept.trim() === '') return true;
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return accept.split(',').some((raw) => {
    const token = raw.trim().toLowerCase();
    if (token === '') return false;
    if (token.startsWith('.')) return name.endsWith(token);
    if (token.endsWith('/*')) return mime.startsWith(token.slice(0, -1));
    return mime === token;
  });
}
