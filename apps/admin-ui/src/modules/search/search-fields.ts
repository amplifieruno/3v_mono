import type { Layout } from '@burojs/core';
import { f } from '@burojs/field-types';
import { COMPANY_RESOURCE, FACILITY_RESOURCE } from '../../data/resource-names';
import { enumField } from '../../enums/field';
import { IDENTITY_STATUS_ENUM, IDENTITY_STATUSES } from '../../enums/identities';
import { PROFILE_TYPE_ENUM, PROFILE_TYPES } from '../../enums/people';
import {
  SEARCH_GENDER_ENUM,
  SEARCH_GENDERS,
  SEARCH_LINKED,
  SEARCH_LINKED_ENUM,
  SEARCH_TYPE_ENUM,
  SEARCH_TYPES,
} from '../../enums/search';
import { rangeValidator } from '../../fields/bounded-number';
import { dateTime } from '../../fields/date-time';
import { facePhotos } from '../../fields/face-photos';
import { SEARCH_MAX_RESULTS, SEARCH_THRESHOLD_RANGE } from './search-definition';

/** `storage.files.metadata.kind` of a search photo: visible to its uploader only (owner-only kind). */
export const SEARCH_PHOTO_KIND = 'search';

const AGE_RANGE = { min: 0, max: 150, integer: true } as const;
const RESULTS_RANGE = { min: 1, max: SEARCH_MAX_RESULTS, integer: true } as const;

const age = (label: string, summary: string) =>
  f.number({ nullable: true, min: 0, max: 150, integer: true, validate: rangeValidator(AGE_RANGE), texts: { label, doc: { summary } } });

/**
 * The fields of a search definition as a form edits them (exported for saved searches, Task 2):
 * the type, the photo (facial and combined searches), the attribute filters, and the threshold,
 * result limit and fuzzy matches. `./search-definition.ts` maps the values to the action's input
 * and back.
 */
export const searchFields = {
  search_type: enumField(SEARCH_TYPES, SEARCH_TYPE_ENUM, {
    required: true,
    texts: {
      label: 'Search by',
      doc: {
        summary:
          'Face compares a photo with every enrolled face; Attributes lists identities matching the filters, without a photo; Face and attributes does both.',
      },
    },
  }),
  photo: facePhotos({
    min: 1,
    max: 1,
    kind: SEARCH_PHOTO_KIND,
    texts: {
      label: 'Photo',
      doc: {
        summary:
          'One photo of the face to look for, uploaded or taken with the camera. When it shows several faces the largest is searched; a photo without a usable face is reported, not searched. Only you can open it.',
      },
    },
  }),
  status: enumField(IDENTITY_STATUSES, IDENTITY_STATUS_ENUM, {
    nullable: true,
    texts: { label: 'Identity status', doc: { summary: 'Only identities with this status; empty for any status.' } },
  }),
  linked: enumField(SEARCH_LINKED, SEARCH_LINKED_ENUM, {
    nullable: true,
    texts: { label: 'Profile link', doc: { summary: 'Only identities of known people, or only unknown ones; empty for both.' } },
  }),
  profile_type: enumField(PROFILE_TYPES, PROFILE_TYPE_ENUM, {
    nullable: true,
    texts: { label: 'Profile type', doc: { summary: 'Only identities linked to a profile of this type (employee, visitor, ...).' } },
  }),
  company_id: f.relation({
    to: COMPANY_RESOURCE,
    nullable: true,
    texts: { label: 'Company', doc: { summary: 'Only identities linked to a profile of this company.' } },
  }),
  gender: enumField(SEARCH_GENDERS, SEARCH_GENDER_ENUM, {
    nullable: true,
    texts: { label: 'Gender', doc: { summary: 'The gender the platform estimated from the identity’s best photo.' } },
  }),
  age_min: age('Age from', 'Only identities whose estimated age is at least this (0–150).'),
  age_max: age('Age to', 'Only identities whose estimated age is at most this (0–150).'),
  first_seen_from: dateTime({ texts: { label: 'First seen from', doc: { summary: 'Only people first seen by a camera at or after this time.' } } }),
  first_seen_to: dateTime({ texts: { label: 'First seen until', doc: { summary: 'Only people first seen by a camera at or before this time.' } } }),
  last_seen_from: dateTime({ texts: { label: 'Last seen from', doc: { summary: 'Only people last seen by a camera at or after this time.' } } }),
  last_seen_to: dateTime({ texts: { label: 'Last seen until', doc: { summary: 'Only people last seen by a camera at or before this time.' } } }),
  facility_id: f.relation({
    to: FACILITY_RESOURCE,
    nullable: true,
    texts: { label: 'Seen in facility', doc: { summary: 'Only people tracked in this facility (within the window below, if given).' } },
  }),
  seen_from: dateTime({ texts: { label: 'Seen from', doc: { summary: 'Only people with a visit still going on at or after this time.' } } }),
  seen_to: dateTime({ texts: { label: 'Seen until', doc: { summary: 'Only people with a visit that had started by this time.' } } }),
  threshold: f.number({
    nullable: true,
    min: SEARCH_THRESHOLD_RANGE.min,
    max: SEARCH_THRESHOLD_RANGE.max,
    validate: rangeValidator(SEARCH_THRESHOLD_RANGE),
    texts: {
      label: 'Threshold',
      doc: {
        summary:
          'The lowest face similarity listed as a match, from 0.2 (loose) to 0.95 (strict). It starts at the organization’s default, 1 minus its recognition threshold. A match at least 0.15 above it is exact, the rest partial.',
      },
    },
  }),
  max_results: f.number({
    required: true,
    min: 1,
    max: SEARCH_MAX_RESULTS,
    integer: true,
    validate: rangeValidator(RESULTS_RANGE),
    texts: { label: 'Results at most', doc: { summary: 'The most identities the search lists, best first (1–100).' } },
  }),
  fuzzy: f.boolean({
    texts: {
      label: 'Include fuzzy matches',
      doc: { summary: 'Also list faces up to 0.1 below the threshold, marked fuzzy: leads worth a look, not matches.' },
    },
  }),
};

export type SearchFields = typeof searchFields;

/** The search form: type and photo first, the filters grouped, then how strict the comparison is. */
export function searchFormBody(l: Layout<SearchFields>) {
  const facial = l.not(l.equals(l.ref('values', 'search_type'), 'attribute'));
  return [
    'search_type',
    l.field('photo', { when: facial }),
    l.panel(
      [
        l.grid(['status', 'linked', 'profile_type', 'company_id']),
        l.grid(['gender', 'age_min', 'age_max']),
        l.grid(['first_seen_from', 'first_seen_to', 'last_seen_from', 'last_seen_to']),
        l.grid(['facility_id', 'seen_from', 'seen_to']),
      ],
      {
        key: 'filters',
        texts: { title: 'Filters', description: 'Every filter you fill in must hold; leave them empty to search everyone.' },
      },
    ),
    l.grid([l.field('threshold', { when: facial }), 'max_results', l.field('fuzzy', { when: facial })]),
  ] as const;
}
