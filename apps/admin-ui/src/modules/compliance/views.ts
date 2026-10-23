import { implementBlock } from '@burojs/react';
import { dsrErasureReviewBlock } from './dsr-erasure-review-block';
import { DsrErasureReviewView } from './dsr-erasure-review-view';
import { dsrStepsBlock } from './dsr-steps-block';
import { DsrStepsView } from './dsr-steps-view';
import { legalHoldNoticeBlock } from './hold-notice-block';
import { LegalHoldNoticeView } from './hold-notice-view';
import { retentionPlanBlock } from './retention-plan-block';
import { RetentionPlanView } from './retention-plan-view';

/** The views of the compliance module's blocks (kept apart from `./index.ts`, which stays React-free). */
export const complianceViews = [
  implementBlock(retentionPlanBlock, { component: RetentionPlanView }),
  implementBlock(legalHoldNoticeBlock, { component: LegalHoldNoticeView }),
  implementBlock(dsrStepsBlock, { component: DsrStepsView }),
  implementBlock(dsrErasureReviewBlock, { component: DsrErasureReviewView }),
] as const;
