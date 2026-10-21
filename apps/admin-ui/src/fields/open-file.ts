import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../data/operations';
import { schema } from '../data/schema';
import type { ConsoleModule } from '../modules/module';

/** The registry key the storage file operations are bound under. */
export const FILES_BINDING = 'storage_files';

export const openFileInput = z.object({ file_id: z.string().uuid() });

export const openFileOutput = z.object({ url: z.string(), expires_at: z.string() });

/** The `open_file` action (`org_admin`): a short-lived URL; audits sensitive kinds. */
export const openFileOperation = hasuraOperation(FILES_BINDING, 'openFile', {
  kind: 'mutation',
  document: `mutation OpenFile($file_id: uuid!) {
  open_file(file_id: $file_id) { url expires_at }
}`,
  variables: (input) => {
    const { file_id } = input as { file_id: string };
    return { file_id };
  },
  mapResult: (data) => rootOf(data, 'open_file'),
});

/**
 * The Hasura action `open_file(file_id)`: a short-lived download URL for a file
 * of the current organization (or `org-logos`). Sensitive kinds are opened only
 * this way, and each opening is written to the audit log (`view_sensitive`).
 */
export const openFile = defineMutation('itap:open-file', {
  binding: openFileOperation.binding,
  input: schema(openFileInput),
  output: schema(openFileOutput),
  effects: 'none',
});

/** The storage file field's own operations, registered like a module (`../modules/index.ts`). */
export const filesModule = {
  name: 'files-module',
  uses: [openFile],
  operations: [openFileOperation],
} as const satisfies ConsoleModule;
