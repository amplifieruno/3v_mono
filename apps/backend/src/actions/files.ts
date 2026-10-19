import { z } from 'zod';
import { AUDITED_FILE_KINDS, createStorageClient } from '../storage/storageClient.js';
import { ActionError, defineAction } from './types.js';

export type FileUrl = { url: string; expires_at: string };
export type DeletedFile = { file_id: string };

/** Shared bucket holding organization logos; readable via open_file by any org admin, never deletable here. */
const SHARED_LOGO_BUCKET = 'org-logos';

const FILE_QUERY = `
  query ActionFile($id: uuid!) {
    file(id: $id) { id bucketId metadata }
  }
`;

// Audit `entity` is the table name (storage.files), as written by the row-change trigger elsewhere.
const AUDIT_VIEW = `
  mutation AuditViewSensitive($org: uuid!, $user: uuid, $file: uuid!) {
    insert_audit_log_one(
      object: { organization_id: $org, user_id: $user, action: view_sensitive, entity: "files", entity_id: $file }
    ) { id }
  }
`;

const AUDIT_DELETE = `
  mutation AuditDeleteFile($org: uuid!, $user: uuid, $file: uuid!) {
    insert_audit_log_one(
      object: { organization_id: $org, user_id: $user, action: delete, entity: "files", entity_id: $file }
    ) { id }
  }
`;

const inputSchema = z.object({ file_id: z.string().uuid() });

type FileRow = { id: string; bucketId: string; metadata: { kind?: unknown } | null };

function notFound(): ActionError {
  return new ActionError('file_not_found', 'File not found');
}

/**
 * Loads a file and checks it belongs to the session organization's bucket (bucket id = org uuid text).
 * Any miss is `file_not_found` so other tenants' files are not disclosed. With `allowShared`, files in
 * the shared `org-logos` bucket also pass.
 */
async function loadOwnFile(
  fileId: string,
  organizationId: string | undefined,
  allowShared: boolean,
  read: (query: string, variables: Record<string, unknown>) => Promise<{ file: FileRow | null }>,
): Promise<FileRow> {
  if (!organizationId) throw new ActionError('no_organization', 'An organization session is required');
  const { file } = await read(FILE_QUERY, { id: fileId });
  if (!file) throw notFound();
  const ownBucket = file.bucketId === organizationId.toLowerCase();
  if (!ownBucket && !(allowShared && file.bucketId === SHARED_LOGO_BUCKET)) throw notFound();
  return file;
}

/** Returns a short-lived download URL; audits `view_sensitive` for sensitive file kinds and reports. */
export const openFile = defineAction(inputSchema, async ({ env, input, session, admin, actor }): Promise<FileUrl> => {
  const file = await loadOwnFile(input.file_id, session.organizationId, true, (q, v) => admin.request(q, v));
  const { url, expiresAt } = await createStorageClient(env).presignedUrl(file.id);

  if (typeof file.metadata?.kind === 'string' && AUDITED_FILE_KINDS.has(file.metadata.kind)) {
    await actor.request(AUDIT_VIEW, {
      org: session.organizationId?.toLowerCase(),
      user: session.userId ?? null,
      file: file.id,
    });
  }
  return { url, expires_at: expiresAt.toISOString() };
});

/** Deletes a file from the session organization's own bucket (never from the shared logo bucket); audited. */
export const deleteFile = defineAction(inputSchema, async ({ env, input, session, admin, actor }): Promise<DeletedFile> => {
  const file = await loadOwnFile(input.file_id, session.organizationId, false, (q, v) => admin.request(q, v));
  await createStorageClient(env).deleteFile(file.id);
  await actor.request(AUDIT_DELETE, {
    org: session.organizationId?.toLowerCase(),
    user: session.userId ?? null,
    file: file.id,
  });
  return { file_id: file.id };
});
