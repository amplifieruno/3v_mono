import { defineMutation, defineQuery } from '@burojs/core';
import { z } from 'zod';
import type { ActionRefusalReader, RefusalIssue } from '../../data/action-refusals';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { SEARCH_REQUEST_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { SETTINGS_RESOURCE } from '../organization/settings';
import { defaultSearchThreshold, searchDefinition } from './search-definition';

/** The registry key the search operations are bound under. */
export const SEARCH_BINDING = 'search';

/** What `search_faces` answers (`SearchResult`): the request it wrote and its outcome. */
export const searchOutcome = z.object({
  search_request_id: z.string(),
  status: z.string(),
  results_count: z.number().int(),
  top_confidence: z.number().nullable(),
  duration_ms: z.number(),
  face_count: z.number().int().nullable(),
  error: z.string().nullable(),
});

export type SearchOutcome = z.infer<typeof searchOutcome>;

const NOTHING = ' Nothing was searched.';

/** The sentence of each refusal `search_faces` answers before it writes anything. */
export const SEARCH_REFUSALS: Readonly<Record<string, string>> = {
  invalid_input: 'The search was refused:',
  invalid_filters:
    'A filter is refused: a company or facility that no longer exists, or a range that ends before it starts.' + NOTHING,
  file_not_found: 'The photo could not be found any more. Remove it, add it again and retry.' + NOTHING,
  no_organization: 'Your session has no organization. Sign in again.' + NOTHING,
};

/**
 * The refusal reader of `search_faces` (`../../data/action-refusals.ts`): its own codes as form
 * issues; `invalid_input` keeps the server's sentence (it names the input). A photo the action
 * reads but cannot search (no face, low quality) is not a refusal: it is a failed request in the
 * history, shown as the search's outcome.
 */
export const searchRefusals: ActionRefusalReader = ({ code, message }) => {
  const text = SEARCH_REFUSALS[code];
  if (text === undefined) return null;
  const issue: RefusalIssue = { code, message: code === 'invalid_input' ? `${text} ${message}.${NOTHING}` : text, path: [] };
  return [issue];
};

/** `search_faces(...)` (org_admin): runs the search as the caller and writes it to their history. */
export const searchFacesOperation = hasuraOperation(
  SEARCH_BINDING,
  'searchFaces',
  {
    kind: 'mutation',
    document: `mutation SearchFaces(
  $type: String!, $image: uuid, $filters: jsonb, $threshold: Float, $max: Int, $fuzzy: Boolean
) {
  search_faces(
    search_type: $type, image_file_id: $image, filters: $filters, threshold: $threshold, max_results: $max, fuzzy: $fuzzy
  ) { search_request_id status results_count top_confidence duration_ms face_count error }
}`,
    variables: (input) => {
      const definition = input as z.infer<typeof searchDefinition>;
      return {
        type: definition.search_type,
        image: definition.image_file_id,
        filters: definition.filters,
        threshold: definition.threshold,
        max: definition.max_results,
        fuzzy: definition.fuzzy,
      };
    },
    mapResult: (data) => rootOf(data, 'search_faces'),
  },
  searchRefusals,
);

/**
 * Runs a face or attribute search. The answer names the request in the caller's history; a photo
 * that could not be searched (no face, too poor) comes back `failed` with the reason.
 */
export const searchFaces = defineMutation('itap:search-faces', {
  binding: searchFacesOperation.binding,
  input: schema(searchDefinition),
  output: schema(searchOutcome),
  effects: [{ resource: SEARCH_REQUEST_RESOURCE }],
});

/** The organization's default search threshold, for the search form. */
export const searchDefaultsOperation = hasuraOperation(SEARCH_BINDING, 'searchDefaults', {
  kind: 'query',
  document: `query SearchDefaults {
  organization_settings(limit: 1) { recognition_threshold }
}`,
  variables: () => ({}),
  mapResult: (data) => {
    const rows = rootOf(data, 'organization_settings');
    const row = Array.isArray(rows) ? (rows[0] as { recognition_threshold?: unknown } | undefined) : undefined;
    const distance = typeof row?.recognition_threshold === 'number' ? row.recognition_threshold : null;
    return { threshold: defaultSearchThreshold(distance) };
  },
});

/** `{ threshold }`: 1 − the organization's recognition threshold, within 0.2..0.95. */
export const searchDefaults = defineQuery('itap:search-defaults', {
  binding: searchDefaultsOperation.binding,
  input: schema(z.object({})),
  output: schema(z.object({ threshold: z.number() })),
  reads: [resourceByName(SETTINGS_RESOURCE)],
});
