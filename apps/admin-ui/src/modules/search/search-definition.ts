import { z } from 'zod';
import { SEARCH_TYPES, type SearchType } from '../../enums/search';

/**
 * A search's definition (spec §6.11, §8.5 `search_faces`): what the action takes and what
 * `search_requests` and `saved_searches` store, in their column names. The search form edits it
 * as flat values (`./search-fields.ts`); {@link searchDefinitionOf} and {@link searchValuesOf}
 * turn one into the other (Task 2's saved searches reuse both).
 */

/** The threshold is a minimum cosine similarity (`itap.search_identities`). */
export const SEARCH_THRESHOLD_RANGE = { min: 0.2, max: 0.95 } as const;
/** Results a search returns at most (`search_requests_max_results`), and by default. */
export const SEARCH_MAX_RESULTS = 100;
export const SEARCH_DEFAULT_MAX_RESULTS = 20;
/** Above the threshold by this much a match is `exact` (`itap.search_identities`). */
export const EXACT_MARGIN = 0.15;
/** Fuzzy matches reach this far below the threshold, never under its minimum. */
export const FUZZY_MARGIN = 0.1;

/** The keys of `filters` the database accepts (`itap.valid_search_filters`). */
export const SEARCH_FILTER_KEYS = [
  'status',
  'linked',
  'profile_type',
  'company_id',
  'gender',
  'age_min',
  'age_max',
  'first_seen_from',
  'first_seen_to',
  'last_seen_from',
  'last_seen_to',
  'facility_id',
  'seen_from',
  'seen_to',
] as const;

export type SearchFilterKey = (typeof SEARCH_FILTER_KEYS)[number];

/** The action's input, which is also a stored definition's columns. */
export const searchDefinition = z.object({
  search_type: z.enum(SEARCH_TYPES),
  image_file_id: z.string().uuid().nullable(),
  filters: z.record(z.unknown()),
  threshold: z.number().nullable(),
  max_results: z.number().int(),
  fuzzy: z.boolean(),
});

export type SearchDefinition = z.infer<typeof searchDefinition>;

/** The search form's values, one per field of `./search-fields.ts`. */
export type SearchValues = {
  readonly search_type: SearchType;
  /** The photo as the face-photo field holds it: at most one file id. */
  readonly photo: readonly string[];
  readonly status: string | null;
  readonly linked: 'linked' | 'unlinked' | null;
  readonly profile_type: string | null;
  readonly company_id: string | null;
  readonly gender: string | null;
  readonly age_min: number | null;
  readonly age_max: number | null;
  readonly first_seen_from: string | null;
  readonly first_seen_to: string | null;
  readonly last_seen_from: string | null;
  readonly last_seen_to: string | null;
  readonly facility_id: string | null;
  readonly seen_from: string | null;
  readonly seen_to: string | null;
  readonly threshold: number | null;
  readonly max_results: number;
  readonly fuzzy: boolean;
};

/** Whether a search of this type compares faces (a photo, a threshold and fuzzy matches apply). */
export const isFacial = (type: unknown): boolean => type !== 'attribute';

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * The organization's default threshold: 1 − its recognition threshold (a maximum face distance),
 * kept within 0.2..0.95, as the server computes it; 0.5 when the organization has no setting.
 */
export function defaultSearchThreshold(recognitionDistance: number | null | undefined): number {
  const similarity = 1 - (recognitionDistance ?? 0.5);
  return round2(Math.min(SEARCH_THRESHOLD_RANGE.max, Math.max(SEARCH_THRESHOLD_RANGE.min, similarity)));
}

/** The match type a similarity gets against `threshold` (as `itap.search_identities` decides it). */
export function matchTypeOf(similarity: number, threshold: number): 'exact' | 'partial' | 'fuzzy' {
  if (similarity >= threshold + EXACT_MARGIN) return 'exact';
  return similarity >= threshold ? 'partial' : 'fuzzy';
}

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** `filters` from the form's values: only what is filled in, in the shape the database checks. */
export function searchFilters(values: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const status = text(values.status);
  if (status !== null) out.status = [status];
  if (values.linked === 'linked' || values.linked === 'unlinked') out.linked = values.linked === 'linked';
  const profileType = text(values.profile_type);
  if (profileType !== null) out.profile_type = [profileType];
  for (const key of ['company_id', 'gender', 'facility_id'] as const) {
    const value = text(values[key]);
    if (value !== null) out[key] = value;
  }
  for (const key of ['age_min', 'age_max'] as const) {
    const value = num(values[key]);
    if (value !== null) out[key] = value;
  }
  for (const key of ['first_seen_from', 'first_seen_to', 'last_seen_from', 'last_seen_to', 'seen_from', 'seen_to'] as const) {
    const value = text(values[key]);
    if (value !== null) out[key] = value;
  }
  return out;
}

/**
 * The action's input from the form's values. An attribute search sends no photo, threshold or
 * fuzzy; an empty threshold leaves the organization's default to the server.
 */
export function searchDefinitionOf(values: Readonly<Record<string, unknown>>): SearchDefinition {
  const type = SEARCH_TYPES.find((candidate) => candidate === values.search_type) ?? 'facial';
  const facial = isFacial(type);
  const photo = Array.isArray(values.photo) ? values.photo.find((id): id is string => typeof id === 'string') : undefined;
  return {
    search_type: type,
    image_file_id: facial ? (photo ?? null) : null,
    filters: searchFilters(values),
    threshold: facial ? num(values.threshold) : null,
    max_results: num(values.max_results) ?? SEARCH_DEFAULT_MAX_RESULTS,
    fuzzy: facial && values.fuzzy === true,
  };
}

const first = (value: unknown): string | null => (Array.isArray(value) ? text(value[0]) : text(value));

/**
 * The form's values for a stored definition (a saved search, a past request). A filter listing
 * several statuses or profile types keeps its first (the form picks one, `tasks/ui/buro-gaps.md` G63).
 */
export function searchValuesOf(definition: Readonly<Record<string, unknown>>): SearchValues {
  const filters = (definition.filters ?? {}) as Readonly<Record<string, unknown>>;
  const type = SEARCH_TYPES.find((candidate) => candidate === definition.search_type) ?? 'facial';
  const image = text(definition.image_file_id);
  return {
    search_type: type,
    photo: image === null ? [] : [image],
    status: first(filters.status),
    linked: filters.linked === true ? 'linked' : filters.linked === false ? 'unlinked' : null,
    profile_type: first(filters.profile_type),
    company_id: text(filters.company_id),
    gender: text(filters.gender),
    age_min: num(filters.age_min),
    age_max: num(filters.age_max),
    first_seen_from: text(filters.first_seen_from),
    first_seen_to: text(filters.first_seen_to),
    last_seen_from: text(filters.last_seen_from),
    last_seen_to: text(filters.last_seen_to),
    facility_id: text(filters.facility_id),
    seen_from: text(filters.seen_from),
    seen_to: text(filters.seen_to),
    threshold: num(definition.threshold),
    max_results: num(definition.max_results) ?? SEARCH_DEFAULT_MAX_RESULTS,
    fuzzy: definition.fuzzy === true,
  };
}

/** The pairs of filters whose first may not exceed the second (`itap.valid_search_filters`). */
export const SEARCH_RANGES = [
  { id: 'age', from: 'age_min', to: 'age_max' },
  { id: 'firstSeen', from: 'first_seen_from', to: 'first_seen_to' },
  { id: 'lastSeen', from: 'last_seen_from', to: 'last_seen_to' },
  { id: 'seen', from: 'seen_from', to: 'seen_to' },
] as const satisfies readonly { readonly id: string; readonly from: SearchFilterKey; readonly to: SearchFilterKey }[];

export type SearchRange = (typeof SEARCH_RANGES)[number];

/** Whether a range of the form is reversed (its start after its end); an open end is never. */
export function rangeReversed(values: Readonly<Record<string, unknown>>, range: SearchRange): boolean {
  const from = values[range.from];
  const to = values[range.to];
  if (typeof from === 'number' && typeof to === 'number') return from > to;
  if (typeof from !== 'string' || typeof to !== 'string' || from === '' || to === '') return false;
  return Date.parse(from) > Date.parse(to);
}

/**
 * The definition of "Run again" on a past request: its type, photo and filters as they were, with
 * the threshold, result limit and fuzzy matches from the form (an attribute search has none).
 */
export function rerunDefinitionOf(
  record: Readonly<Record<string, unknown>>,
  values: Readonly<Record<string, unknown>>,
): SearchDefinition {
  const stored = searchValuesOf(record);
  const facial = isFacial(stored.search_type);
  const filters = record.filters !== null && typeof record.filters === 'object' ? (record.filters as Record<string, unknown>) : {};
  return {
    search_type: stored.search_type,
    image_file_id: facial ? (stored.photo[0] ?? null) : null,
    filters,
    threshold: facial ? (num(values.threshold) ?? stored.threshold) : null,
    max_results: num(values.max_results) ?? stored.max_results,
    fuzzy: facial && values.fuzzy === true,
  };
}
