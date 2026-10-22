import { implementBlock } from '@burojs/react';
import { segmentStatsBlock } from './segment-stats-block';
import { SegmentStatsView } from './segment-stats-view';

/** The segment trend block's view, for `<BuroProvider blockImplementations>` (via the segments views). */
export const segmentStatsView = implementBlock(segmentStatsBlock, { component: SegmentStatsView });
