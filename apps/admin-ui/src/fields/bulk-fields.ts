import type { FieldTexts } from '@burojs/core';
import { type JsonFieldOpts, f } from '@burojs/field-types';

/** The field implementation ids of the bulk job fields (`./bulk-fields-impl.ts`). */
export const BULK_ERROR_FIELD = 'itap.bulk-error';
export const BULK_OPTIONS_FIELD = 'itap.bulk-options';
export const BULK_SEARCH_PHOTOS_FIELD = 'itap.bulk-search-photos';

/** `metadata.kind` of a bulk job's input file: owner-only (`itap.owner_only_file_kinds`). */
export const BULK_INPUT_KIND = 'bulk_input';
/** `metadata.kind` of a search photo (owner-only), as `src/modules/search/search-fields.ts` uploads it. */
export const SEARCH_IMAGE_KIND = 'search';
/** Largest input file the backend reads (`apps/backend/src/bulk/columns.ts` MAX_FILE_BYTES). */
export const BULK_INPUT_MAX_BYTES = 5 * 1024 * 1024;

interface DisplayOptions {
  readonly texts?: string | FieldTexts;
  readonly in?: JsonFieldOpts['in'];
}

/**
 * A job's or row's `error` code shown as a sentence (`required:email` → "The “email” column is empty;
 * this row needs it."), read only (`./bulk-format.ts`).
 */
export function bulkErrorField(opts: DisplayOptions = {}) {
  const base = f.text({
    system: true,
    nullable: true,
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
    ...(opts.in === undefined ? {} : { in: opts.in }),
  });
  return { ...base, ui: { ...base.ui, display: BULK_ERROR_FIELD }, meta: {} };
}

/** A job's `options` jsonb in words, by the record's kind (dry run, update key, threshold, results). */
export function bulkOptionsField(opts: DisplayOptions = {}) {
  const base = f.json({
    system: true,
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
    ...(opts.in === undefined ? {} : { in: opts.in }),
  });
  return { ...base, ui: { ...base.ui, display: BULK_OPTIONS_FIELD }, meta: {} };
}

/**
 * A bulk face search's input: the member picks face photos, each is uploaded as their own `search`
 * image, and the console writes the CSV the job reads (`image_file_id,label`, the file name as the
 * label), uploaded as their `bulk_input` file; the value is that CSV's file id.
 */
export function bulkSearchPhotosField(opts: { readonly texts?: string | FieldTexts } = {}) {
  const base = f.uuid({ required: true, ...(opts.texts === undefined ? {} : { texts: opts.texts }) });
  return { ...base, ui: { ...base.ui, input: BULK_SEARCH_PHOTOS_FIELD, display: BULK_SEARCH_PHOTOS_FIELD }, meta: {} };
}
