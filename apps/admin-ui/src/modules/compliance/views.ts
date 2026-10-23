import { implementBlock } from '@burojs/react';
import { auditDiffBlock } from './audit-diff-block';
import { AuditDiffView } from './audit-diff-view';
import { dsrErasureReviewBlock } from './dsr-erasure-review-block';
import { DsrErasureReviewView } from './dsr-erasure-review-view';
import { dsrStepsBlock } from './dsr-steps-block';
import { DsrStepsView } from './dsr-steps-view';
import { legalHoldNoticeBlock } from './hold-notice-block';
import { jobWatchBlock } from './job-watch-block';
import { JobWatchView } from './job-watch-view';
import { LegalHoldNoticeView } from './hold-notice-view';
import { retentionPlanBlock } from './retention-plan-block';
import { RetentionPlanView } from './retention-plan-view';
import { systemStatusBlock } from './system-status-block';
import { SystemStatusView } from './system-status-view';

/** The views of the compliance module's blocks (kept apart from `./index.ts`, which stays React-free). */
export const complianceViews = [
  implementBlock(retentionPlanBlock, { component: RetentionPlanView }),
  implementBlock(legalHoldNoticeBlock, { component: LegalHoldNoticeView }),
  implementBlock(dsrStepsBlock, { component: DsrStepsView }),
  implementBlock(dsrErasureReviewBlock, { component: DsrErasureReviewView }),
  implementBlock(jobWatchBlock, { component: JobWatchView }),
  implementBlock(systemStatusBlock, { component: SystemStatusView }),
  implementBlock(auditDiffBlock, { component: AuditDiffView }),
] as const;
