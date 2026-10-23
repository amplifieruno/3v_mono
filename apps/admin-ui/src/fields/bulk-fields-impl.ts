import { fieldImplementation } from '@burojs/react';
import { z } from 'zod';
import { BULK_ERROR_FIELD, BULK_OPTIONS_FIELD, BULK_SEARCH_PHOTOS_FIELD } from './bulk-fields';
import { BulkErrorDisplay, BulkOptionsDisplay } from './bulk-fields-display';
import { BulkSearchPhotosDisplay, BulkSearchPhotosInput } from './bulk-search-photos-input';

/** The bulk job fields: error sentences, options in words (displays) and the bulk search photo picker. */
export const bulkFieldImplementations = {
  [BULK_ERROR_FIELD]: fieldImplementation({ meta: z.object({}), Display: BulkErrorDisplay }),
  [BULK_OPTIONS_FIELD]: fieldImplementation({ meta: z.object({}), Display: BulkOptionsDisplay }),
  [BULK_SEARCH_PHOTOS_FIELD]: fieldImplementation({ meta: z.object({}), Input: BulkSearchPhotosInput, Display: BulkSearchPhotosDisplay }),
};
