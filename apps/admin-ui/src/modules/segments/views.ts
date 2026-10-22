import { implementBlock } from '@burojs/react';
import { segmentStatsView } from '../../blocks/segment-stats/views';
import { segmentEvaluationBlock } from './segment-evaluation-block';
import { SegmentEvaluationView } from './segment-evaluation-view';
import { segmentPreviewBlock } from './segment-preview-block';
import { SegmentPreviewView } from './segment-preview-view';

/** The views of the segments module's blocks (kept apart from `./index.ts`, which stays React-free). */
export const segmentsViews = [
  segmentStatsView,
  implementBlock(segmentPreviewBlock, { component: SegmentPreviewView }),
  implementBlock(segmentEvaluationBlock, { component: SegmentEvaluationView }),
] as const;
