import { implementBlock } from '@burojs/react';
import { dashboardGridBlock } from './dashboard-grid-block';
import { DashboardGridView } from './dashboard-grid-view';

/** The dashboard grid's view, for `<BuroProvider blockImplementations>` (via the analytics views). */
export const dashboardGridView = implementBlock(dashboardGridBlock, { component: DashboardGridView });
