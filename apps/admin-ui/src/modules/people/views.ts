import { implementBlock } from '@burojs/react';
import { photoGalleryView } from '../../blocks/photo-gallery/views';
import { enrollmentResultBlock } from './enrollment-result-block';
import { EnrollmentResultView } from './enrollment-result-view';
import { profileCompareBlock } from './profile-compare-block';
import { ProfileCompareView } from './profile-compare-view';

/** The views of the people module's blocks (kept apart from `./index.ts`, which stays React-free). */
export const peopleViews = [
  implementBlock(profileCompareBlock, { component: ProfileCompareView }),
  implementBlock(enrollmentResultBlock, { component: EnrollmentResultView }),
  photoGalleryView,
] as const;
