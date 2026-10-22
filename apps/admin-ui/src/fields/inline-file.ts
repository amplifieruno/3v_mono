import type { FieldTexts } from '@burojs/core';
import { f } from '@burojs/field-types';
import { z } from 'zod';

/** The field implementation id of {@link inlineFile} (`./inline-file-impl.ts`). */
export const INLINE_FILE_FIELD = 'itap.inline-file';

/** A picked file carried in the payload: its name, type, size and base64 content (no data URL prefix). */
export const inlineFileValue = z.object({
  file_name: z.string().min(1),
  mime_type: z.string(),
  size: z.number().nonnegative(),
  content_base64: z.string().min(1),
});

export type InlineFileValue = z.infer<typeof inlineFileValue>;

export interface InlineFileOptions {
  /** HTML `accept` tokens; the input refuses other files before reading them. */
  readonly accept: string;
  /** Largest file the input reads, in bytes. */
  readonly maxSize: number;
  readonly required?: boolean;
  readonly texts?: string | FieldTexts;
}

/**
 * A file picked in a flow form and sent inside the mutation's input as base64, for actions that
 * store the file themselves (`upload_profile_document`): nothing goes to storage from the
 * browser. The value is an {@link InlineFileValue}, or `null` until a file is picked. It is
 * `sensitive`, so the content never lands in a form draft or an audit event.
 */
export function inlineFile(opts: InlineFileOptions) {
  const base = f.json({
    required: opts.required ?? true,
    nullable: true,
    sensitive: true,
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  });
  return {
    ...base,
    ui: { ...base.ui, input: INLINE_FILE_FIELD, display: INLINE_FILE_FIELD },
    meta: { accept: opts.accept, maxSize: opts.maxSize },
  };
}

/** The base64 content of `file` (no `data:` prefix), read in the browser. */
export function readBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read'));
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : '';
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}
