import { implementBlock } from '@burojs/react';
import { identityTimelineView } from '../../blocks/identity-timeline/views';
import { photoGalleryView } from '../../blocks/photo-gallery/views';
import { enrollmentResultBlock } from './enrollment-result-block';
import { EnrollmentResultView } from './enrollment-result-view';
import { identityMergeReviewBlock } from './identity-merge-review-block';
import { IdentityMergeReviewView } from './identity-merge-review-view';
import { identityRelationshipsBlock } from './identity-relationships-block';
import { IdentityRelationshipsView } from './identity-relationships-view';
import { mergeRollbackReviewBlock } from './merge-rollback-review-block';
import { MergeRollbackReviewView } from './merge-rollback-review-view';
import { profileCompareBlock } from './profile-compare-block';
import { ProfileCompareView } from './profile-compare-view';

/** The views of the people module's blocks (kept apart from `./index.ts`, which stays React-free). */
export const peopleViews = [
  implementBlock(profileCompareBlock, { component: ProfileCompareView }),
  implementBlock(enrollmentResultBlock, { component: EnrollmentResultView }),
  photoGalleryView,
  implementBlock(identityMergeReviewBlock, { component: IdentityMergeReviewView }),
  implementBlock(mergeRollbackReviewBlock, { component: MergeRollbackReviewView }),
  implementBlock(identityRelationshipsBlock, { component: IdentityRelationshipsView }),
  identityTimelineView,
] as const;
