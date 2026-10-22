import { implementBlock } from '@burojs/react';
import { heatmapBlock } from './heatmap-block';
import { HeatmapView } from './heatmap-view';

/** The heatmap block's view, for `<BuroProvider blockImplementations>` (via the analytics views). */
export const heatmapView = implementBlock(heatmapBlock, { component: HeatmapView });
