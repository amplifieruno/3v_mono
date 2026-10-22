import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/*
 * Search enums (spec §6.11). Types, statuses and match types are the rows of the Hasura enum tables in
 * `SEARCH_ENUM_TABLES`; the gender and profile-link filters are console-only choices of the search form
 * (keys of `search_requests.filters`, checked by `itap.valid_search_filters`).
 */

export const SEARCH_TYPE_ENUM = 'search_type';
export const SEARCH_STATUS_ENUM = 'search_status';
export const SEARCH_MATCH_TYPE_ENUM = 'search_match_type';
/** `filters.gender`: the gender estimated from the identity's best photo. */
export const SEARCH_GENDER_ENUM = 'search_gender';
/** `filters.linked`: whether the identity is linked to a profile. */
export const SEARCH_LINKED_ENUM = 'search_linked';

export const SEARCH_TYPES = ['facial', 'attribute', 'combined'] as const;
export const SEARCH_STATUSES = ['queued', 'running', 'completed', 'failed'] as const;
export const SEARCH_MATCH_TYPES = ['exact', 'partial', 'fuzzy'] as const;
export const SEARCH_GENDERS = ['male', 'female'] as const;
export const SEARCH_LINKED = ['linked', 'unlinked'] as const;

export type SearchType = (typeof SEARCH_TYPES)[number];
export type SearchMatchType = (typeof SEARCH_MATCH_TYPES)[number];

export const searchTypeEnum = defineEnum({
  name: SEARCH_TYPE_ENUM,
  values: enumValues(SEARCH_TYPES, { facial: 'info', attribute: 'secondary', combined: 'outline' }),
  texts: {
    facial: { label: 'Face', doc: { summary: 'Finds the identities whose face looks like the face in a photo.' } },
    attribute: {
      label: 'Attributes',
      doc: { summary: 'Finds identities by status, profile, age, gender and when or where they were seen; no photo.' },
    },
    combined: {
      label: 'Face and attributes',
      doc: { summary: 'Finds the identities that look like the photo and also match the attribute filters.' },
    },
  },
});

export const searchStatusEnum = defineEnum({
  name: SEARCH_STATUS_ENUM,
  values: enumValues(SEARCH_STATUSES, { queued: 'secondary', running: 'info', completed: 'success', failed: 'destructive' }),
  texts: {
    queued: { label: 'Queued', doc: { summary: 'Accepted and waiting to run; a search takes seconds.' } },
    running: { label: 'Running', doc: { summary: 'The photo is being read and compared.' } },
    completed: { label: 'Completed', doc: { summary: 'The search ran; its results (possibly none) are listed.' } },
    failed: {
      label: 'Failed',
      doc: { summary: 'The search could not run, for example because the photo shows no usable face; the outcome says why.' },
    },
  },
});

export const searchMatchTypeEnum = defineEnum({
  name: SEARCH_MATCH_TYPE_ENUM,
  values: enumValues(SEARCH_MATCH_TYPES, { exact: 'success', partial: 'info', fuzzy: 'warning' }),
  texts: {
    exact: {
      label: 'Exact',
      doc: {
        summary:
          'A strong match: the similarity is at least 0.15 above the threshold. An attribute search lists every identity it finds as exact.',
      },
    },
    partial: { label: 'Partial', doc: { summary: 'A match at or just above the threshold: check the photo before acting on it.' } },
    fuzzy: {
      label: 'Fuzzy',
      doc: { summary: 'Below the threshold, by up to 0.1, listed only when fuzzy matches were asked for: a lead, not a match.' },
    },
  },
});

export const searchGenderEnum = defineEnum({
  name: SEARCH_GENDER_ENUM,
  values: enumValues(SEARCH_GENDERS, { male: 'secondary', female: 'secondary' }),
  texts: {
    male: { label: 'Male', doc: { summary: 'Identities whose best photo was estimated as a man.' } },
    female: { label: 'Female', doc: { summary: 'Identities whose best photo was estimated as a woman.' } },
  },
});

export const searchLinkedEnum = defineEnum({
  name: SEARCH_LINKED_ENUM,
  values: enumValues(SEARCH_LINKED, { linked: 'info', unlinked: 'secondary' }),
  texts: {
    linked: { label: 'Linked to a profile', doc: { summary: 'Only identities of known people (with a profile).' } },
    unlinked: { label: 'Without a profile', doc: { summary: 'Only unknown identities (no profile).' } },
  },
});

/** Each Hasura-backed enum above by the enum table holding its values. */
export const SEARCH_ENUM_TABLES: Readonly<Record<string, string>> = {
  [SEARCH_TYPE_ENUM]: 'search_types',
  [SEARCH_STATUS_ENUM]: 'search_statuses',
  [SEARCH_MATCH_TYPE_ENUM]: 'search_match_types',
};
