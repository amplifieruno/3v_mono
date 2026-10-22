import { searchResultsBlock } from '../../blocks/search-results/search-results-block';
import { searchRunOperation, searchRunQuery } from '../../blocks/search-results/search-results-query';
import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import { SEARCH_REQUEST_RESOURCE, SEARCH_WORKSPACE_RESOURCE } from '../../data/resource-names';
import type { ConsoleModule } from '../module';
import { searchDefaults, searchDefaultsOperation, searchFaces, searchFacesOperation } from './search-ops';
import { searchPage, searchWorkspaceBlock } from './search-page';
import { searchRequest } from './search-request';
import { searchRequestFields } from './search-request-fields';
import { searchWorkspace, searchWorkspaceFields } from './search-workspace';

/**
 * Search: face and attribute search (`search_faces`) on the Search page, the photo uploaded or
 * taken with the camera; the outcome and results block (`itap:search-results`); and the member's
 * own search history with "Run again". The search definition (`./search-definition.ts`,
 * `./search-fields.ts`) and the results block are shared with saved searches and bulk search.
 */
export const searchModule = {
  name: 'search-module',
  uses: [
    searchWorkspace,
    searchRequest,
    searchPage,
    searchWorkspaceBlock,
    searchResultsBlock,
    searchFaces,
    searchDefaults,
    searchRunQuery,
  ],
  tables: {
    [SEARCH_WORKSPACE_RESOURCE]: hasuraTable('organization_settings', {
      selectFields: selectFieldsOf(searchWorkspaceFields),
      pkField: 'organization_id',
    }),
    [SEARCH_REQUEST_RESOURCE]: hasuraTable('search_requests', { selectFields: selectFieldsOf(searchRequestFields) }),
  },
  operations: [searchFacesOperation, searchDefaultsOperation, searchRunOperation],
} as const satisfies ConsoleModule;
