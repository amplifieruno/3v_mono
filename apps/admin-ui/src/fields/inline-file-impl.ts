import { fieldImplementation } from '@burojs/react';
import { INLINE_FILE_FIELD } from './inline-file';
import { InlineFileDisplay } from './inline-file-display';
import { InlineFileInput } from './inline-file-input';
import { inlineFileMeta } from './inline-file-meta';

/** The `itap.inline-file` input and display, for `composeFieldImplementations`. */
export const inlineFileImplementations = {
  [INLINE_FILE_FIELD]: fieldImplementation({
    meta: inlineFileMeta,
    Input: InlineFileInput,
    Display: InlineFileDisplay,
  }),
};
