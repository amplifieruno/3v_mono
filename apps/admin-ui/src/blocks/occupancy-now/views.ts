import { implementBlock } from '@burojs/react';
import { occupancyNowBlock } from './occupancy-now-block';
import { OccupancyNowView } from './occupancy-now-view';

/** The occupancy block's view, for `<BuroProvider blockImplementations>` (via the monitoring views). */
export const occupancyNowView = implementBlock(occupancyNowBlock, { component: OccupancyNowView });
