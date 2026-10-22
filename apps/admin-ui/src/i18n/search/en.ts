import type { TranslationBundle } from '@burojs/i18n-core';

/**
 * Search in the `common` namespace (English, primary): the readable summary of a search's filters
 * (`console.searchFilters`, `src/fields/search-filters-format.ts`). Kept apart from
 * `../locales/<locale>.ts` for size; the registry deep-merges it into `common`.
 */
export default {
  console: {
    searchFilters: {
      everyone: 'Everyone (no filters)',
      labels: {
        status: 'Identity status',
        linked: 'Profile link',
        profile_type: 'Profile type',
        company_id: 'Company',
        gender: 'Gender',
        age: 'Age',
        firstSeen: 'First seen',
        lastSeen: 'Last seen',
        facility_id: 'Seen in facility',
        seen: 'Visit',
      },
      between: '{{from}} to {{to}}',
      from: 'from {{from}}',
      until: 'until {{to}}',
      unknownCompany: 'a company that no longer exists',
      unknownFacility: 'a facility that no longer exists',
      other: '{{key}}: {{value}}',
    },
  },
} satisfies TranslationBundle;
