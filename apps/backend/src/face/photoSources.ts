import type { HasuraClient } from '../hasura/client.js';
import { OWNER_ONLY_FILE_KINDS, SENSITIVE_FILE_KINDS, type StorageClient } from '../storage/storageClient.js';

/** Largest accepted source photo. */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

/**
 * One photo to enroll. `ref` identifies it in `rejected` (the file id for uploaded files, any caller label for
 * buffers); `fileId` is set when the photo is a stored file (recorded on the crop as `source_file_id`).
 * `load` is called once, when the photo's turn comes (photos are processed one at a time).
 */
export type PhotoSource = { ref: string; fileId?: string; load(): Promise<Buffer> };

/** Raised by `PhotoSource.load` (or image decoding) for content that is not a usable image → `invalid_image`. */
export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidImageError';
  }
}

/** Thrown when a file id is missing, outside the session organization's bucket, or a sensitive kind. */
export class PhotoNotFoundError extends Error {
  readonly fileId: string;

  constructor(fileId: string) {
    super(`File not found: ${fileId}`);
    this.name = 'PhotoNotFoundError';
    this.fileId = fileId;
  }
}

/** A photo given as bytes (seed, tests). */
export function photoFromBuffer(ref: string, image: Buffer): PhotoSource {
  return { ref, load: async () => image };
}

const FILES_QUERY = `
  query EnrollmentFiles($ids: [uuid!]!) {
    files(where: { id: { _in: $ids } }) { id bucketId mimeType size metadata uploadedByUserId }
  }
`;

type FileRow = {
  id: string;
  bucketId: string;
  mimeType: string | null;
  size: number | null;
  metadata: unknown;
  uploadedByUserId?: string | null;
};

function fileKind(metadata: unknown): string | undefined {
  if (typeof metadata !== 'object' || metadata === null || !('kind' in metadata)) return undefined;
  return typeof metadata.kind === 'string' ? metadata.kind : undefined;
}

/**
 * Resolves uploaded files of the organization into photo sources. Every id must exist in the organization's own
 * bucket (bucket id = organization uuid), must not be a sensitive kind (SENSITIVE_FILE_KINDS) and, for an owner-only
 * kind (search images), must have been uploaded by `userId`; otherwise PhotoNotFoundError (other tenants', sensitive
 * and other members' private files are not disclosed).
 * Nothing is downloaded here; non-image or oversized files become `invalid_image` when loaded.
 */
export async function loadOrganizationPhotos(
  admin: HasuraClient,
  storage: StorageClient,
  organizationId: string,
  fileIds: string[],
  userId?: string,
): Promise<PhotoSource[]> {
  const { files } = await admin.request<{ files: FileRow[] }>(FILES_QUERY, { ids: fileIds });
  const byId = new Map(files.map((file) => [file.id, file]));
  const bucket = organizationId.toLowerCase();

  return fileIds.map((fileId) => {
    const file = byId.get(fileId);
    if (!file || file.bucketId !== bucket) throw new PhotoNotFoundError(fileId);
    // Sensitive files are read only through audited access: an enrollment crop would bypass that audit.
    const kind = fileKind(file.metadata);
    if (kind !== undefined && SENSITIVE_FILE_KINDS.has(kind)) throw new PhotoNotFoundError(fileId);
    if (kind !== undefined && OWNER_ONLY_FILE_KINDS.has(kind)) {
      const uploader = file.uploadedByUserId?.toLowerCase();
      if (!uploader || uploader !== userId?.toLowerCase()) throw new PhotoNotFoundError(fileId);
    }
    return {
      ref: fileId,
      fileId,
      async load() {
        if (!file.mimeType?.startsWith('image/')) throw new InvalidImageError(`Not an image: ${file.mimeType}`);
        if ((file.size ?? 0) > MAX_PHOTO_BYTES) throw new InvalidImageError('Photo exceeds 15 MB');
        return storage.download(fileId);
      },
    };
  });
}
