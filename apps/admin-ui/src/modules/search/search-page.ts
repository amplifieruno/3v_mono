import { defineBlock, defineCustomPage } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';

/**
 * The body of the Search page: the search workspace's record screen for the current organization
 * (`./search-workspace-view.tsx`), which draws the search form in place (G63).
 */
export const searchWorkspaceBlock = defineBlock('itap:search-workspace', { texts: 'Search' });

/**
 * "Search": the search form in place (`./search-flows.ts`); once it ran, its outcome and results
 * replace the form (`itap:search-results`), and Done starts a new search. Past searches are in
 * Search history.
 */
export const searchPage = defineCustomPage({
  name: 'face-search',
  icon: NAV_ICONS.search,
  path: '/search',
  texts: 'Search',
  section: NAV_SECTIONS.search,
  order: 1,
  body: (l) => [l.place(searchWorkspaceBlock, { key: 'search' })],
});
