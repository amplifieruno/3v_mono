import { implementBlock } from '@burojs/react';
import { occupancySeriesBlock } from './occupancy-series-block';
import { OccupancySeriesView } from './occupancy-series-view';

/** The occupancy series block's view, for `<BuroProvider blockImplementations>` (via the analytics views). */
export const occupancySeriesView = implementBlock(occupancySeriesBlock, { component: OccupancySeriesView });
