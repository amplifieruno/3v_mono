import type { ExtractedFace } from '../face/insightFaceClient.js';

/**
 * Search options (spec §6.11, §8.5 search_faces). The threshold is a minimum cosine SIMILARITY (0.2..0.95); the
 * organization default is 1 - organization_settings.recognition_threshold (a maximum cosine distance, the
 * match_face convention), clamped into that range. Results: at most 100 (default 20). Facial and combined searches
 * need an image; attribute searches take none and ignore threshold / fuzzy.
 */
export const MIN_THRESHOLD = 0.2;
export const MAX_THRESHOLD = 0.95;
export const MAX_RESULTS = 100;
export const DEFAULT_MAX_RESULTS = 20;

export const SEARCH_TYPES = ['facial', 'attribute', 'combined'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/** A business error of a search request (mapped to an ActionError by the action, recorded by the cron). */
export class SearchError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SearchError';
    this.code = code;
  }
}

export type SearchInput = {
  searchType: string;
  imageFileId?: string | null;
  filters?: Record<string, unknown> | null;
  threshold?: number | null;
  maxResults?: number | null;
  fuzzy?: boolean | null;
};

export type SearchOptions = {
  searchType: SearchType;
  imageFileId: string | null;
  filters: Record<string, unknown>;
  /** Minimum similarity; null for attribute searches. */
  threshold: number | null;
  maxResults: number;
  fuzzy: boolean;
};

const clamp = (value: number): number => Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, value));

/** Organization default similarity threshold from its recognition distance (null = no setting: 0.5). */
export function defaultThreshold(recognitionDistance: number | null): number {
  return clamp(1 - (recognitionDistance ?? 0.5));
}

const invalid = (message: string): SearchError => new SearchError('invalid_input', message);

function isSearchType(value: string): value is SearchType {
  return (SEARCH_TYPES as readonly string[]).includes(value);
}

/** Validates the request and fills defaults; throws SearchError('invalid_input'). */
export function resolveSearchOptions(input: SearchInput, recognitionDistance: number | null): SearchOptions {
  if (!isSearchType(input.searchType)) throw invalid(`search_type: expected one of ${SEARCH_TYPES.join(', ')}`);
  const imageFileId = input.imageFileId ?? null;
  if (input.searchType === 'attribute' && imageFileId !== null) {
    throw invalid('image_file_id: not allowed for an attribute search');
  }
  if (input.searchType !== 'attribute' && imageFileId === null) {
    throw invalid(`image_file_id: required for a ${input.searchType} search`);
  }
  const maxResults = input.maxResults ?? DEFAULT_MAX_RESULTS;
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > MAX_RESULTS) {
    throw invalid(`max_results: expected an integer 1..${MAX_RESULTS}`);
  }
  const threshold = input.threshold ?? null;
  if (threshold !== null && !(threshold >= MIN_THRESHOLD && threshold <= MAX_THRESHOLD)) {
    throw invalid(`threshold: expected ${MIN_THRESHOLD}..${MAX_THRESHOLD}`);
  }
  const facial = input.searchType !== 'attribute';
  return {
    searchType: input.searchType,
    imageFileId,
    filters: input.filters ?? {},
    threshold: facial ? (threshold ?? defaultThreshold(recognitionDistance)) : null,
    maxResults,
    fuzzy: facial ? (input.fuzzy ?? false) : false,
  };
}

/** The face with the largest bounding box (a group photo is searched by its most prominent face). */
export function largestFace(faces: ExtractedFace[]): ExtractedFace | undefined {
  const area = ({ bbox: [x1, y1, x2, y2] }: ExtractedFace): number => Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return faces.reduce<ExtractedFace | undefined>((best, face) => (!best || area(face) > area(best) ? face : best), undefined);
}
