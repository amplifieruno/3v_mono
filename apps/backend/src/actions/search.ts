import { z } from 'zod';
import { createInsightFaceClient } from '../face/insightFaceClient.js';
import { SearchError } from '../search/options.js';
import { runSearch } from '../search/searchService.js';
import { createStorageClient } from '../storage/storageClient.js';
import { ActionError, defineAction } from './types.js';

export type SearchFacesResult = {
  search_request_id: string;
  status: string;
  results_count: number;
  top_confidence: number | null;
  duration_ms: number;
  face_count: number | null;
  error: string | null;
};

const inputSchema = z.object({
  search_type: z.string(),
  image_file_id: z.string().uuid().nullish(),
  filters: z.record(z.unknown()).nullish(),
  threshold: z.number().nullish(),
  max_results: z.number().nullish(),
  fuzzy: z.boolean().nullish(),
});

/**
 * search_faces(search_type, image_file_id, filters, threshold, max_results, fuzzy): runs a search as the caller
 * (search core: src/search/searchService.ts). A face-level failure (no_face, low_quality, invalid_image) is a
 * `failed` request in the caller's history, returned with its error; input problems are ActionErrors
 * (invalid_input, invalid_filters, file_not_found) and write nothing.
 */
export const searchFaces = defineAction(inputSchema, async (ctx): Promise<SearchFacesResult> => {
  const organizationId = ctx.session.organizationId;
  const userId = ctx.session.userId;
  if (!organizationId || !userId) throw new ActionError('no_organization', 'An organization session is required');
  try {
    const outcome = await runSearch(
      {
        admin: ctx.admin,
        actor: ctx.actor,
        storage: createStorageClient(ctx.env),
        insightFace: createInsightFaceClient(ctx.env.INSIGHTFACE_API_URL),
      },
      {
        organizationId,
        userId,
        input: {
          searchType: ctx.input.search_type,
          imageFileId: ctx.input.image_file_id,
          filters: ctx.input.filters,
          threshold: ctx.input.threshold,
          maxResults: ctx.input.max_results,
          fuzzy: ctx.input.fuzzy,
        },
      },
    );
    return {
      search_request_id: outcome.searchRequestId,
      status: outcome.status,
      results_count: outcome.resultsCount,
      top_confidence: outcome.topConfidence,
      duration_ms: outcome.durationMs,
      face_count: outcome.faceCount,
      error: outcome.error,
    };
  } catch (error: unknown) {
    if (error instanceof SearchError) throw new ActionError(error.code, error.message);
    throw error;
  }
});
