import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../data/operations';
import { resourceByName } from '../data/resource-by-name';
import { COMPANY_RESOURCE, FACILITY_RESOURCE } from '../data/resource-names';
import { schema } from '../data/schema';

/** The registry key the filter summary's operation is bound under. */
export const SEARCH_FILTERS_BINDING = 'search-filters';

const named = z.object({ id: z.string(), name: z.string() });

export const searchFilterNames = z.object({ companies: z.array(named), facilities: z.array(named) });

export type SearchFilterNames = z.infer<typeof searchFilterNames>;

const listOf = (data: unknown, root: string): z.infer<typeof named>[] => {
  const parsed = z.array(named).safeParse(rootOf(data, root));
  return parsed.success ? parsed.data : [];
};

export const searchFilterNamesOperation = hasuraOperation(SEARCH_FILTERS_BINDING, 'searchFilterNames', {
  kind: 'query',
  document: `query SearchFilterNames($companies: [uuid!]!, $facilities: [uuid!]!) {
  companies(where: { id: { _in: $companies } }) { id name }
  facilities(where: { id: { _in: $facilities } }) { id name }
}`,
  variables: (input) => {
    const { companies, facilities } = input as { companies: string[]; facilities: string[] };
    return { companies, facilities };
  },
  mapResult: (data): SearchFilterNames => ({ companies: listOf(data, 'companies'), facilities: listOf(data, 'facilities') }),
});

/** The names of the company and facility a search's filters name (`./search-filters-display.tsx`). */
export const searchFilterNamesQuery = defineQuery('itap:search-filter-names', {
  binding: searchFilterNamesOperation.binding,
  input: schema(z.object({ companies: z.array(z.string()), facilities: z.array(z.string()) })),
  output: schema(searchFilterNames),
  reads: [resourceByName(COMPANY_RESOURCE), resourceByName(FACILITY_RESOURCE)],
});
