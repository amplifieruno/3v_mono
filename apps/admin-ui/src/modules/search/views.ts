import { implementBlock } from '@burojs/react';
import { bulkJobProgressView } from '../../blocks/bulk-job-progress/views';
import { searchResultsView } from '../../blocks/search-results/views';
import { searchWorkspaceBlock } from './search-page';
import { SearchWorkspaceView } from './search-workspace-view';

/** The views of the search module's blocks (kept apart from `./index.ts`, which stays React-free). */
export const searchViews = [
  searchResultsView,
  bulkJobProgressView,
  implementBlock(searchWorkspaceBlock, { component: SearchWorkspaceView }),
] as const;
