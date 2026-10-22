import { implementBlock } from '@burojs/react';
import { areaParentGuardBlock } from './area-parent-guard-block';
import { AreaParentGuardView } from './area-parent-guard-view';
import { areaTreeBlock } from './area-tree-block';
import { AreaTreeView } from './area-tree-view';
import { placesPlaceholderBlock } from './placeholder-block';
import { PlacesPlaceholderView } from './placeholder-view';

/** The views of the places module's blocks (kept apart from `./index.ts`, which stays React-free). */
export const placesViews = [
  implementBlock(areaTreeBlock, { component: AreaTreeView }),
  implementBlock(areaParentGuardBlock, { component: AreaParentGuardView }),
  implementBlock(placesPlaceholderBlock, { component: PlacesPlaceholderView }),
] as const;
