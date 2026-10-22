import { defineMutation, defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { SAVED_SEARCH_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { sqlRefusals } from '../../data/sql-refusals';
import { savedSearchValuesOf } from './saved-search-shape';

/** The registry key the saved-search operations are bound under. */
export const SAVED_SEARCH_BINDING = 'saved-search';

const NOTHING = ' Nothing was saved.';

/**
 * The sentences of what the database refuses on a saved search (`saved_searches_guard`,
 * `search_definition_guard` and the table's checks), by code or constraint name.
 */
export const SAVED_SEARCH_REFUSALS = {
  search_filters_invalid: 'A filter names a company or facility that no longer exists: choose another or clear it.' + NOTHING,
  search_image_not_found: 'The photo could not be found any more: remove it, add it again and save.' + NOTHING,
  search_image_required: 'A face search needs a photo: add one, or search by attributes only.' + NOTHING,
  search_image_not_allowed: 'An attribute search has no photo: remove it, or search by face.' + NOTHING,
  saved_searches_name_not_blank: 'Give the saved search a name.' + NOTHING,
  saved_searches_filters_valid: 'A filter is refused: a range that ends before it starts, or an age outside 0–150.' + NOTHING,
  saved_searches_threshold_range: 'The threshold must be between 0.2 and 0.95.' + NOTHING,
  saved_searches_max_results_range: 'Results at most must be between 1 and 100.' + NOTHING,
  saved_searches_cron_valid: 'The schedule is not one the platform accepts: five fields, for example 0 7 * * 1.' + NOTHING,
} as const;

const refusals = sqlRefusals(SAVED_SEARCH_REFUSALS, 'The saved search was refused: {{detail}}.' + NOTHING);

/** The columns written (insert and update alike); the definition is left out of an update that keeps it. */
const savedSearchColumns = z.object({
  name: z.string(),
  description: z.string().nullable(),
  is_shared: z.boolean(),
  schedule_cron: z.string().nullable(),
  alert_on_match: z.boolean(),
  search_type: z.string().optional(),
  image_file_id: z.string().nullable().optional(),
  filters: z.record(z.unknown()).optional(),
  threshold: z.number().nullable().optional(),
  max_results: z.number().int().optional(),
  fuzzy: z.boolean().optional(),
});

const written = z.object({ id: z.string(), last_search_request_id: z.string().nullable() });

export const createSavedSearchOperation = hasuraOperation(
  SAVED_SEARCH_BINDING,
  'createSavedSearch',
  {
    kind: 'mutation',
    document: `mutation CreateSavedSearch($object: saved_searches_insert_input!) {
  insert_saved_searches_one(object: $object) { id last_search_request_id }
}`,
    variables: (input) => ({ object: input }),
    mapResult: (data) => rootOf(data, 'insert_saved_searches_one'),
  },
  refusals,
);

/** Saves a new saved search, owned by the caller (the owner is stamped by the database). */
export const createSavedSearch = defineMutation('itap:create-saved-search', {
  binding: createSavedSearchOperation.binding,
  input: schema(savedSearchColumns),
  output: schema(written),
  effects: [{ resource: SAVED_SEARCH_RESOURCE }],
});

export const updateSavedSearchOperation = hasuraOperation(
  SAVED_SEARCH_BINDING,
  'updateSavedSearch',
  {
    kind: 'mutation',
    document: `mutation UpdateSavedSearch($id: uuid!, $set: saved_searches_set_input!) {
  update_saved_searches_by_pk(pk_columns: { id: $id }, _set: $set) { id last_search_request_id }
}`,
    variables: (input) => {
      const { id, set } = input as { id: string; set: Record<string, unknown> };
      return { id, set };
    },
    mapResult: (data) => rootOf(data, 'update_saved_searches_by_pk') ?? null,
  },
  refusals,
);

/**
 * Changes a saved search of the caller's (`null`: not theirs, or gone). A changed definition
 * clears `last_search_request_id`, the alert baseline, in the same statement.
 */
export const updateSavedSearch = defineMutation('itap:update-saved-search', {
  binding: updateSavedSearchOperation.binding,
  input: schema(z.object({ id: z.string().uuid(), set: savedSearchColumns })),
  output: schema(written.nullable()),
  effects: [{ resource: SAVED_SEARCH_RESOURCE }],
});

const FORM_COLUMNS =
  'id name description search_type image_file_id filters threshold max_results fuzzy is_shared schedule_cron alert_on_match';

export const savedSearchFormOperation = hasuraOperation(SAVED_SEARCH_BINDING, 'savedSearchForm', {
  kind: 'query',
  document: `query SavedSearchForm($id: uuid!) {
  saved_searches_by_pk(id: $id) { ${FORM_COLUMNS} }
}`,
  variables: (input) => ({ id: (input as { id: string }).id }),
  mapResult: (data) => {
    const row = rootOf(data, 'saved_searches_by_pk');
    return typeof row === 'object' && row !== null ? savedSearchValuesOf(row as Readonly<Record<string, unknown>>) : null;
  },
});

/** A saved search as its edit form's values (`null` when it is gone). */
export const savedSearchForm = defineQuery('itap:saved-search-form', {
  binding: savedSearchFormOperation.binding,
  input: schema(z.object({ id: z.string().uuid() })),
  output: schema(z.record(z.unknown()).nullable()),
  reads: [resourceByName(SAVED_SEARCH_RESOURCE)],
});
