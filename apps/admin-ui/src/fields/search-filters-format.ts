import { IDENTITY_STATUS_ENUM } from '../enums/identities';
import { PROFILE_TYPE_ENUM } from '../enums/people';
import { SEARCH_GENDER_ENUM, SEARCH_LINKED_ENUM } from '../enums/search';

/**
 * A search's `filters` (`itap.valid_search_filters`) as people read them: one labelled part per
 * filter, enum values by their labels, a company or facility by its name, ranges as "a to b".
 * Pure: the display (`./search-filters-display.tsx`) hands in the translations and the names.
 */

/** What the summary needs from its host: texts, enum labels, record names and times. */
export interface SearchFilterNamer {
  /** A `console.searchFilters.*` text. */
  readonly text: (key: string, params?: Readonly<Record<string, unknown>>) => string;
  readonly enumLabel: (enumName: string, value: string) => string;
  /** A company's or facility's name; `null` when it is not (or no longer) known. */
  readonly name: (kind: 'company' | 'facility', id: string) => string | null;
  readonly dateTime: (iso: string) => string;
}

export interface SearchFilterPart {
  /** The filter (or range) it shows: `status`, `age`, `seen`, or an unknown key as stored. */
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

type Filters = Readonly<Record<string, unknown>>;

/** The stored filters as an object (anything else reads as no filters). */
export function filtersOf(value: unknown): Filters {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Filters) : {};
}

/** The company and facility ids the filters name, for reading their names. */
export function filterReferences(value: unknown): { readonly companies: string[]; readonly facilities: string[] } {
  const filters = filtersOf(value);
  const id = (key: string): string[] => (typeof filters[key] === 'string' && filters[key] !== '' ? [filters[key] as string] : []);
  return { companies: id('company_id'), facilities: id('facility_id') };
}

const ENUM_KEYS = { status: IDENTITY_STATUS_ENUM, profile_type: PROFILE_TYPE_ENUM, gender: SEARCH_GENDER_ENUM } as const;

const RANGES = [
  { key: 'age', from: 'age_min', to: 'age_max' },
  { key: 'firstSeen', from: 'first_seen_from', to: 'first_seen_to' },
  { key: 'lastSeen', from: 'last_seen_from', to: 'last_seen_to' },
  { key: 'seen', from: 'seen_from', to: 'seen_to' },
] as const;

/** Every key the summary reads; any other key is shown as stored. */
const KNOWN = new Set<string>([
  ...Object.keys(ENUM_KEYS),
  'linked',
  'company_id',
  'facility_id',
  ...RANGES.flatMap((range) => [range.from, range.to]),
]);

const listOf = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === 'string' && item !== '');

function rangeText(filters: Filters, range: (typeof RANGES)[number], namer: SearchFilterNamer): string | null {
  const show = (value: unknown): string | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return typeof value === 'string' && value !== '' ? (range.key === 'age' ? value : namer.dateTime(value)) : null;
  };
  const from = show(filters[range.from]);
  const to = show(filters[range.to]);
  if (from !== null && to !== null) return namer.text('between', { from, to });
  if (from !== null) return namer.text('from', { from });
  return to === null ? null : namer.text('until', { to });
}

/**
 * The filters, one part each, in the order of the search form; an empty list when the search
 * filters nothing (the display then says "everyone").
 */
export function searchFilterParts(value: unknown, namer: SearchFilterNamer): SearchFilterPart[] {
  const filters = filtersOf(value);
  const parts: SearchFilterPart[] = [];
  const add = (key: string, text: string | null) => {
    if (text !== null && text !== '') parts.push({ key, label: namer.text(`labels.${key}`), value: text });
  };
  const enumText = (key: keyof typeof ENUM_KEYS) => {
    const values = listOf(filters[key]);
    return values.length === 0 ? null : values.map((item) => namer.enumLabel(ENUM_KEYS[key], item)).join(', ');
  };
  add('status', enumText('status'));
  if (typeof filters.linked === 'boolean') add('linked', namer.enumLabel(SEARCH_LINKED_ENUM, filters.linked ? 'linked' : 'unlinked'));
  add('profile_type', enumText('profile_type'));
  const { companies, facilities } = filterReferences(filters);
  for (const id of companies) add('company_id', namer.name('company', id) ?? namer.text('unknownCompany'));
  add('gender', enumText('gender'));
  const [age, firstSeen, lastSeen, seen] = RANGES;
  for (const range of [age, firstSeen, lastSeen]) add(range.key, rangeText(filters, range, namer));
  for (const id of facilities) add('facility_id', namer.name('facility', id) ?? namer.text('unknownFacility'));
  add(seen.key, rangeText(filters, seen, namer));
  for (const key of Object.keys(filters).filter((name) => !KNOWN.has(name))) {
    parts.push({ key, label: key, value: JSON.stringify(filters[key]) });
  }
  return parts;
}
