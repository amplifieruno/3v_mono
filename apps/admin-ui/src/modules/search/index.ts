import { searchResultsBlock } from '../../blocks/search-results/search-results-block';
import { searchRunOperation, searchRunQuery } from '../../blocks/search-results/search-results-query';
import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import {
  BULK_JOB_RESOURCE,
  BULK_JOB_ROW_RESOURCE,
  SAVED_SEARCH_RESOURCE,
  SEARCH_REQUEST_RESOURCE,
  SEARCH_WORKSPACE_RESOURCE,
} from '../../data/resource-names';
import { bulkJobProgressBlock } from '../../blocks/bulk-job-progress/bulk-job-progress-block';
import { searchFilterNamesOperation, searchFilterNamesQuery } from '../../fields/search-filters-query';
import type { ConsoleModule } from '../module';
import { bulkJob } from './bulk-job';
import { bulkJobFields } from './bulk-job-fields';
import { BULK_JOB_OPERATIONS, bulkJobProgressQuery, cancelBulkJob, createBulkJob, retryBulkJob } from './bulk-job-ops';
import { bulkJobRow, bulkJobRowFields } from './bulk-job-row';
import { savedSearch } from './saved-search';
import { savedSearchFields } from './saved-search-fields';
import {
  createSavedSearch,
  createSavedSearchOperation,
  savedSearchForm,
  savedSearchFormOperation,
  updateSavedSearch,
  updateSavedSearchOperation,
} from './saved-search-ops';
import { searchDefaults, searchDefaultsOperation, searchFaces, searchFacesOperation } from './search-ops';
import { searchPage, searchWorkspaceBlock } from './search-page';
import { searchRequest } from './search-request';
import { searchRequestFields } from './search-request-fields';
import { searchWorkspace, searchWorkspaceFields } from './search-workspace';

/**
 * Search: face and attribute search (`search_faces`) on the Search page, the photo uploaded or
 * taken with the camera; the outcome and results block (`itap:search-results`); and the member's
 * own search history with "Run again"; saved searches with Run now, schedules and new-match alerts;
 * bulk jobs (profile import and update from a CSV file, bulk face search from photos) with live
 * progress, rows by outcome, Cancel and Retry.
 * The search definition (`./search-definition.ts`,
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
    savedSearch,
    createSavedSearch,
    updateSavedSearch,
    savedSearchForm,
    searchFilterNamesQuery,
    bulkJob,
    bulkJobRow,
    bulkJobProgressBlock,
    createBulkJob,
    retryBulkJob,
    cancelBulkJob,
    bulkJobProgressQuery,
  ],
  tables: {
    [SEARCH_WORKSPACE_RESOURCE]: hasuraTable('organization_settings', {
      selectFields: selectFieldsOf(searchWorkspaceFields),
      pkField: 'organization_id',
    }),
    [SEARCH_REQUEST_RESOURCE]: hasuraTable('search_requests', { selectFields: selectFieldsOf(searchRequestFields) }),
    [SAVED_SEARCH_RESOURCE]: hasuraTable('saved_searches', { selectFields: selectFieldsOf(savedSearchFields) }),
    [BULK_JOB_RESOURCE]: hasuraTable('bulk_jobs', { selectFields: selectFieldsOf(bulkJobFields) }),
    [BULK_JOB_ROW_RESOURCE]: hasuraTable('bulk_job_rows', { selectFields: selectFieldsOf(bulkJobRowFields) }),
  },
  operations: [
    searchFacesOperation,
    searchDefaultsOperation,
    searchRunOperation,
    createSavedSearchOperation,
    updateSavedSearchOperation,
    savedSearchFormOperation,
    searchFilterNamesOperation,
    ...BULK_JOB_OPERATIONS,
  ],
} as const satisfies ConsoleModule;
