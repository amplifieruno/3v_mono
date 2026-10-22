import { implementBlock } from '@burojs/react';
import { searchResultsBlock } from './search-results-block';
import { SearchResultsView } from './search-results-view';

/** The search results block's view, for `<BuroProvider blockImplementations>` (via the search views). */
export const searchResultsView = implementBlock(searchResultsBlock, { component: SearchResultsView });
