import { z } from 'zod';
import type { HasuraClient } from '../hasura/client.js';
import { createStorageClient, type StorageClient } from '../storage/storageClient.js';
import { ActionError, defineAction } from './types.js';

export type UploadedProfileDocument = { document_id: string; file_id: string };

/** Largest accepted document, decoded. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const inputSchema = z.object({
  profile_id: z.string().uuid(),
  kind: z.enum(['id_card', 'contract', 'nda', 'badge_photo', 'other']),
  title: z.string().trim().min(1).max(200),
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.string().trim().min(1).max(127),
  content_base64: z.string().regex(BASE64, 'must be non-empty base64'),
});

const PROFILE_QUERY = `
  query ActionProfile($id: uuid!, $org: uuid!) {
    profiles(where: { id: { _eq: $id }, organization_id: { _eq: $org } }, limit: 1) { id }
  }
`;

const INSERT_DOCUMENT = `
  mutation InsertProfileDocument($object: profile_documents_insert_input!) {
    insert_profile_documents_one(object: $object) { id }
  }
`;

/** Decoded size of a canonical base64 string, computed without decoding it. */
function decodedSize(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export type StoreProfileDocumentInput = {
  organizationId: string;
  profileId: string;
  kind: string;
  title: string;
  fileName: string;
  mimeType: string;
  data: Buffer;
};

/**
 * Stores a profile document: the file goes to the organization bucket with `metadata.kind = 'profile_document'`
 * (org_admin cannot read it directly; `open_file` audits access), then the `profile_documents` row is written
 * through `actor` so the audit trail records the caller. A failed insert removes the uploaded file.
 * Shared by the upload_profile_document action and the seed.
 */
export async function storeProfileDocument(
  deps: { storage: StorageClient; actor: HasuraClient },
  input: StoreProfileDocumentInput,
): Promise<UploadedProfileDocument> {
  const { id: fileId } = await deps.storage.upload({
    bucketId: input.organizationId,
    name: input.fileName,
    mimeType: input.mimeType,
    data: input.data,
    metadata: { kind: 'profile_document', profile_id: input.profileId },
  });
  try {
    const { insert_profile_documents_one: row } = await deps.actor.request<{ insert_profile_documents_one: { id: string } }>(
      INSERT_DOCUMENT,
      {
        object: {
          organization_id: input.organizationId,
          profile_id: input.profileId,
          file_id: fileId,
          kind: input.kind,
          title: input.title,
        },
      },
    );
    return { document_id: row.id, file_id: fileId };
  } catch (error: unknown) {
    await deps.storage.deleteFile(fileId).catch(() => undefined);
    throw error;
  }
}

/** upload_profile_document: validates the input and the profile, then stores the document (storeProfileDocument). */
export const uploadProfileDocument = defineAction(
  inputSchema,
  async ({ env, input, session, admin, actor }): Promise<UploadedProfileDocument> => {
    const organizationId = session.organizationId?.toLowerCase();
    if (!organizationId) throw new ActionError('no_organization', 'An organization session is required');
    if (decodedSize(input.content_base64) > MAX_DOCUMENT_BYTES) {
      throw new ActionError('file_too_large', 'The document exceeds 10 MB');
    }

    const { profiles } = await admin.request<{ profiles: { id: string }[] }>(PROFILE_QUERY, {
      id: input.profile_id,
      org: organizationId,
    });
    if (profiles.length === 0) throw new ActionError('profile_not_found', 'Profile not found');

    return storeProfileDocument(
      { storage: createStorageClient(env), actor },
      {
        organizationId,
        profileId: input.profile_id,
        kind: input.kind,
        title: input.title,
        fileName: input.file_name,
        mimeType: input.mime_type,
        data: Buffer.from(input.content_base64, 'base64'),
      },
    );
  },
);
