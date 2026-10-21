import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { schema } from '../data/schema';

/** The registry key (`src/data/operations.ts`) the storage file operations are bound under. */
export const FILES_BINDING = 'storage_files';

export const openFileInput = z.object({ file_id: z.string().uuid() });

export const openFileOutput = z.object({ url: z.string(), expires_at: z.string() });

/**
 * The Hasura action `open_file(file_id)`: a short-lived download URL for a file
 * of the current organization (or `org-logos`). Sensitive kinds are opened only
 * this way, and each opening is written to the audit log (`view_sensitive`).
 */
export const openFile = defineMutation('itap:open-file', {
  binding: { provider: 'hasura', resource: FILES_BINDING, operation: 'openFile' },
  input: schema(openFileInput),
  output: schema(openFileOutput),
  effects: 'none',
});
