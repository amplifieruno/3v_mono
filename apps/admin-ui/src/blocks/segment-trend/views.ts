import { implementBlock } from '@burojs/react';
import { segmentTrendBlock } from './segment-trend-block';
import { SegmentTrendView } from './segment-trend-view';

/** The segment trend block's view, for `<BuroProvider blockImplementations>` (via the analytics views). */
export const segmentTrendView = implementBlock(segmentTrendBlock, { component: SegmentTrendView });
