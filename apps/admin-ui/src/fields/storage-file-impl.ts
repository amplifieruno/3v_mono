import { fieldImplementation } from '@burojs/react';
import { STORAGE_FILE_FIELD } from './storage-file';
import { StorageFileDisplay } from './storage-file-display';
import { StorageFileInput } from './storage-file-input';
import { storageFileMeta } from './storage-file-meta';

/** The `itap.storage-file` input and display, for `composeFieldImplementations`. */
export const storageFileImplementations = {
  [STORAGE_FILE_FIELD]: fieldImplementation({
    meta: storageFileMeta,
    Input: StorageFileInput,
    Display: StorageFileDisplay,
  }),
};
