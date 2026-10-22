import { implementBlock } from '@burojs/react';
import { placesPlaceholderBlock } from './placeholder-block';
import { PlacesPlaceholderView } from './placeholder-view';

/** The views of the places module's blocks (kept apart from `./index.ts`, which stays React-free). */
export const placesViews = [
  implementBlock(placesPlaceholderBlock, { component: PlacesPlaceholderView }),
] as const;
