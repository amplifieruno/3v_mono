import { implementBlock } from '@burojs/react';
import { profileCompareBlock } from './profile-compare-block';
import { ProfileCompareView } from './profile-compare-view';

/** The views of the people module's blocks (kept apart from `./index.ts`, which stays React-free). */
export const peopleViews = [implementBlock(profileCompareBlock, { component: ProfileCompareView })] as const;
