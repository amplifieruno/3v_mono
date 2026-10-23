import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import {
  DSR_RESOURCE,
  LEGAL_HOLD_RESOURCE,
  PROCESSING_ACTIVITY_DATA_CLASS_RESOURCE,
  PROCESSING_ACTIVITY_RESOURCE,
  RETENTION_POLICY_RESOURCE,
  RETENTION_RUN_CLASS_RESOURCE,
  RETENTION_RUN_RESOURCE,
} from '../../data/resource-names';
import type { ConsoleModule } from '../module';
import { dataSubjectRequest } from './dsr';
import { erasureHolds, erasureHoldsOperation } from './dsr-erasure-holds-query';
import { dsrErasureReviewBlock } from './dsr-erasure-review-block';
import { dsrFields } from './dsr-fields';
import { DSR_OPERATIONS, completeDataSubjectRequest, createDataSubjectRequest, rejectDataSubjectRequest, retryDataSubjectRequest } from './dsr-ops';
import { dsrStepsBlock } from './dsr-steps-block';
import { dataSubjectRequestProgress, dsrProgressOperation, holdNamesOperation, legalHoldNames } from './dsr-steps-query';
import { dataSubject, dsrSubjectOperation } from './dsr-subject-query';
import { legalHoldNoticeBlock } from './hold-notice-block';
import { holdNoticeOperation, legalHoldsCovering } from './hold-notice-query';
import { legalHold, legalHoldFields } from './legal-hold';
import { endHoldOperation, endLegalHold } from './legal-hold-ops';
import { HOLD_TARGETS, HOLD_TARGET_RESOURCES, holdTargetFields } from './legal-hold-targets';
import { processingActivity, processingActivityFields } from './processing-activity';
import { activityDataClassFields, processingActivityDataClass } from './processing-activity-data-class';
import { retentionPlanBlock } from './retention-plan-block';
import { retentionPlanPage } from './retention-plan-page';
import { retentionPlanOperation, retentionPlanQuery } from './retention-plan-query';
import { retentionPolicy } from './retention-policy';
import { retentionPolicyFields } from './retention-policy-fields';
import { deletePolicyOperation, deleteRetentionPolicy, setPolicyActiveOperation, setRetentionPolicyActive } from './retention-policy-ops';
import { retentionRun, retentionRunFields } from './retention-run';
import { retentionRunClass, retentionRunClassFields } from './retention-run-class';

// `hold { starts_at ends_at }`: a target's Delete rule reads whether its hold is in force (G75).
const targetTables = Object.fromEntries(
  HOLD_TARGETS.map((spec) => [
    spec.resource,
    hasuraTable('legal_hold_targets', { selectFields: [...selectFieldsOf(holdTargetFields(spec)), 'hold { starts_at ends_at }'] }),
  ]),
);

/**
 * Compliance: retention policies (how long each class of data is kept, class rules mirrored as
 * checks, activation as flows), the retention plan (a dry run of the nightly purge, writes
 * nothing), the retention runs with their per-class rows (read-only logs), legal holds with
 * their targets (people, identities, incidents, facilities; start frozen once started, end only
 * set or shortened, ended now by a flow, never deleted) and the hold notice on held profiles,
 * identities and incidents; data subject requests (one "new request" flow per type, the
 * background job's steps, Reject / Complete / Retry, the bundle through `open_file`, erasure
 * behind a review and a typed confirmation) and the records of processing with their data
 * classes and DPIA.
 */
export const complianceModule = {
  name: 'compliance-module',
  uses: [
    retentionPolicy,
    setRetentionPolicyActive,
    deleteRetentionPolicy,
    retentionPlanQuery,
    retentionPlanBlock,
    retentionPlanPage,
    retentionRun,
    retentionRunClass,
    legalHold,
    endLegalHold,
    ...HOLD_TARGET_RESOURCES,
    legalHoldsCovering,
    legalHoldNoticeBlock,
    dataSubjectRequest,
    createDataSubjectRequest,
    rejectDataSubjectRequest,
    completeDataSubjectRequest,
    retryDataSubjectRequest,
    dataSubjectRequestProgress,
    legalHoldNames,
    dataSubject,
    erasureHolds,
    dsrStepsBlock,
    dsrErasureReviewBlock,
    processingActivity,
    processingActivityDataClass,
  ],
  tables: {
    [RETENTION_POLICY_RESOURCE]: hasuraTable('retention_policies', { selectFields: selectFieldsOf(retentionPolicyFields) }),
    [RETENTION_RUN_RESOURCE]: hasuraTable('retention_runs', { selectFields: selectFieldsOf(retentionRunFields), orderByField: 'scheduled_at' }),
    [RETENTION_RUN_CLASS_RESOURCE]: hasuraTable('retention_run_classes', { selectFields: selectFieldsOf(retentionRunClassFields) }),
    [LEGAL_HOLD_RESOURCE]: hasuraTable('legal_holds', { selectFields: selectFieldsOf(legalHoldFields), orderByField: 'starts_at' }),
    ...targetTables,
    [DSR_RESOURCE]: hasuraTable('data_subject_requests', { selectFields: selectFieldsOf(dsrFields), orderByField: 'received_at' }),
    [PROCESSING_ACTIVITY_RESOURCE]: hasuraTable('processing_activities', { selectFields: selectFieldsOf(processingActivityFields) }),
    [PROCESSING_ACTIVITY_DATA_CLASS_RESOURCE]: hasuraTable('processing_activity_data_classes', { selectFields: selectFieldsOf(activityDataClassFields) }),
  },
  operations: [
    setPolicyActiveOperation,
    deletePolicyOperation,
    retentionPlanOperation,
    endHoldOperation,
    holdNoticeOperation,
    ...DSR_OPERATIONS,
    dsrProgressOperation,
    holdNamesOperation,
    dsrSubjectOperation,
    erasureHoldsOperation,
  ],
} as const satisfies ConsoleModule;
