import { defineResource, inlineFlow } from '@burojs/core';
import { f } from '@burojs/field-types';
import { SEARCH_WORKSPACE_RESOURCE } from '../../data/resource-names';
import { searchFlow } from './search-flows';

/** Columns of `itap.organization_settings` the search workspace reads: the row's key only. */
export const searchWorkspaceFields = {
  organization_id: f.uuid({ system: true, texts: 'Organization', in: [] }),
};

/**
 * The Search page's record (`tasks/ui/buro-gaps.md` G63): the current organization's settings row,
 * read by its organization id, whose show screen places the "Search" flow inline. A resource-level
 * flow placed on a custom page is drawn without its label in buro 0.6, so the search runs as an
 * item flow of this current-record screen instead. No list, no edit; nothing is written to it.
 */
export const searchWorkspace = defineResource(SEARCH_WORKSPACE_RESOURCE, {
  texts: {
    label: 'Search workspace',
    labelPlural: 'Search workspaces',
    doc: {
      summary:
        'Where face and attribute searches are run: the Search page of the current organization. It stores nothing; each search goes to your search history.',
    },
  },
  data: { provider: 'hasura', idField: 'organization_id' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: searchWorkspaceFields,
  actions: (r) => ({ item: [r.action.flow('search', searchFlow)] }),
  views: {
    list: { page: false },
    show: { body: (l) => [l.place(inlineFlow, { key: 'search', props: { flow: 'search' } })] },
  },
});
