import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { SEARCH_REQUEST_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';

/** The registry key the results block's operation is bound under. */
export const SEARCH_RESULTS_BINDING = 'search-results';

export const searchMatch = z.object({
  id: z.string(),
  rank: z.number().int(),
  /** Face similarity 0..1; `null` in an attribute search. */
  confidence: z.number().nullable(),
  match_type: z.string(),
  /** The identity found (a merged one is already its target); `null` once deleted. */
  identity: z
    .object({ id: z.string(), code: z.string(), status: z.string(), primary_photo_file_id: z.string().nullable() })
    .nullable(),
  profile: z.object({ id: z.string(), full_name: z.string().nullable(), profile_type: z.string() }).nullable(),
});

export const searchRun = z.object({
  id: z.string(),
  search_type: z.string(),
  status: z.string(),
  error: z.string().nullable(),
  face_count: z.number().int().nullable(),
  results_count: z.number().int(),
  top_confidence: z.number().nullable(),
  duration_ms: z.number().nullable(),
  threshold: z.number().nullable(),
  fuzzy: z.boolean(),
  max_results: z.number().int(),
  image_file_id: z.string().nullable(),
  created_at: z.string(),
  results: z.array(searchMatch),
});

export type SearchMatch = z.infer<typeof searchMatch>;
export type SearchRun = z.infer<typeof searchRun>;

/** One request of the caller's history with its ranked results (owner-only: someone else's reads as none). */
export const searchRunOperation = hasuraOperation(SEARCH_RESULTS_BINDING, 'searchRun', {
  kind: 'query',
  document: `query SearchRun($id: uuid!) {
  search_requests_by_pk(id: $id) {
    id search_type status error face_count results_count top_confidence duration_ms threshold fuzzy max_results
    image_file_id created_at
    results: search_results(order_by: { rank: asc }) {
      id rank confidence match_type
      identity { id code status primary_photo_file_id }
      profile { id full_name profile_type }
    }
  }
}`,
  variables: (input) => ({ id: (input as { requestId: string }).requestId }),
  mapResult: (data) => {
    const row = searchRun.safeParse(rootOf(data, 'search_requests_by_pk'));
    return row.success ? row.data : null;
  },
});

/** A search request and its results (`itap:search-results`); `null` when it is not the caller's or gone. */
export const searchRunQuery = defineQuery('itap:search-run', {
  binding: searchRunOperation.binding,
  input: schema(z.object({ requestId: z.string().uuid() })),
  output: schema(searchRun.nullable()),
  reads: [resourceByName(SEARCH_REQUEST_RESOURCE)],
});
