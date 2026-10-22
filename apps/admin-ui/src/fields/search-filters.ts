import type { FieldTexts } from '@burojs/core';
import { type JsonFieldOpts, f } from '@burojs/field-types';

/** The field implementation id of {@link searchFiltersField} (`./search-filters-impl.ts`). */
export const SEARCH_FILTERS_FIELD = 'itap.search-filters';

export interface SearchFiltersOptions {
  readonly texts?: string | FieldTexts;
  readonly in?: JsonFieldOpts['in'];
}

/**
 * A search's stored `filters` jsonb (search requests, saved searches), shown read only as people
 * read it: `Identity status: Verified · Company: Acme · Age: 20 to 40`, enum values by their
 * labels and the company or facility by its name (`./search-filters-format.ts`). The search form
 * edits the filters as separate fields (`src/modules/search/search-fields.ts`).
 */
export function searchFiltersField(opts: SearchFiltersOptions = {}) {
  const base = f.json({
    system: true,
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
    ...(opts.in === undefined ? {} : { in: opts.in }),
  });
  return { ...base, ui: { ...base.ui, display: SEARCH_FILTERS_FIELD }, meta: {} };
}
