import { implementBlock } from '@burojs/react';
import { occupancyNowBlock } from './occupancy-now-block';
import { OccupancyNowView } from './occupancy-now-view';
import { occupancyUpdatedBlock } from './occupancy-updated-block';
import { OccupancyUpdatedView } from './occupancy-updated-view';

/** The occupancy block's view, for `<BuroProvider blockImplementations>` (via the monitoring views). */
export const occupancyNowView = implementBlock(occupancyNowBlock, { component: OccupancyNowView });

/** The workspace's occupancy clock, which also keeps its facts fresh. */
export const occupancyUpdatedView = implementBlock(occupancyUpdatedBlock, { component: OccupancyUpdatedView });
