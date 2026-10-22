import type { FieldTexts } from '@burojs/core';
import { f } from '@burojs/field-types';

/** The field implementation id of {@link storageFile} (`./storage-file-impl.ts`). */
export const STORAGE_FILE_FIELD = 'itap.storage-file';

/** Shared bucket of organization logos (readable by `user` and `org_admin`). */
export const ORG_LOGOS_BUCKET = 'org-logos';

/**
 * Where a file goes: `organization` is the current organization's own bucket
 * (bucket id = organization id), `org-logos` the shared logo bucket.
 */
export type StorageBucket = 'organization' | typeof ORG_LOGOS_BUCKET;

export interface StorageFileOptions {
  readonly bucket: StorageBucket;
  /** Written to `storage.files.metadata.kind`; storage permissions and retention read it. */
  readonly kind: string;
  /** HTML `accept` tokens (`image/*`); an `image/` accept also makes the display a preview. */
  readonly accept?: string;
  /** Largest file the input sends, in bytes. */
  readonly maxSize?: number;
  /** A sensitive file is opened only through the audited `open_file` action, never presigned. */
  readonly sensitive?: boolean;
  readonly nullable?: boolean;
  /**
   * Never written by a form (`write: 'never'`): the file is attached by something else, such as
   * an action that stores it (profile documents). Display only.
   */
  readonly displayOnly?: boolean;
  readonly texts?: FieldTexts;
}

/**
 * A hasura-storage file referenced by its id in a `uuid` column (for example
 * `organizations.logo_file_id`). The input uploads to hasura-storage first and
 * writes the returned file id; the display shows a preview or a link.
 *
 * Local workaround for buro gap G2 (`tasks/ui/buro-gaps.md`): replaced by
 * `f.file` + `nhostFileStorage` once buro ships PR #137 (REF-67).
 */
export function storageFile(opts: StorageFileOptions) {
  const base = f.uuid({
    nullable: opts.nullable ?? true,
    ...(opts.displayOnly === true ? { write: 'never' as const } : {}),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  });
  return {
    ...base,
    ui: { ...base.ui, input: STORAGE_FILE_FIELD, display: STORAGE_FILE_FIELD },
    meta: {
      bucket: opts.bucket,
      kind: opts.kind,
      sensitive: opts.sensitive ?? false,
      accept: opts.accept ?? null,
      maxSize: opts.maxSize ?? null,
    },
  };
}
