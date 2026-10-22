import { fieldImplementation } from '@burojs/react';
import { z } from 'zod';
import { SEARCH_FILTERS_FIELD } from './search-filters';
import { SearchFiltersDisplay } from './search-filters-display';

/** The `itap.search-filters` display (no input: the search form edits the filters as fields). */
export const searchFiltersImplementations = {
  [SEARCH_FILTERS_FIELD]: fieldImplementation({ meta: z.object({}), Display: SearchFiltersDisplay }),
};
