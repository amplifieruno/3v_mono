import { implementBlock } from '@burojs/react';
import { floorPlanBlock } from './floor-plan-block';
import { FloorPlanView } from './floor-plan-view';

/** The floor plan block's view, for `<BuroProvider blockImplementations>` (via the places views). */
export const floorPlanView = implementBlock(floorPlanBlock, { component: FloorPlanView });
