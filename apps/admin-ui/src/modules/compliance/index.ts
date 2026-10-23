import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import { LEGAL_HOLD_RESOURCE, RETENTION_POLICY_RESOURCE, RETENTION_RUN_CLASS_RESOURCE, RETENTION_RUN_RESOURCE } from '../../data/resource-names';
import type { ConsoleModule } from '../module';
import { legalHoldNoticeBlock } from './hold-notice-block';
import { holdNoticeOperation, legalHoldsCovering } from './hold-notice-query';
import { legalHold, legalHoldFields } from './legal-hold';
import { endHoldOperation, endLegalHold } from './legal-hold-ops';
import { HOLD_TARGETS, HOLD_TARGET_RESOURCES, holdTargetFields } from './legal-hold-targets';
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
 * identities and incidents.
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
  ],
  tables: {
    [RETENTION_POLICY_RESOURCE]: hasuraTable('retention_policies', { selectFields: selectFieldsOf(retentionPolicyFields) }),
    [RETENTION_RUN_RESOURCE]: hasuraTable('retention_runs', { selectFields: selectFieldsOf(retentionRunFields), orderByField: 'scheduled_at' }),
    [RETENTION_RUN_CLASS_RESOURCE]: hasuraTable('retention_run_classes', { selectFields: selectFieldsOf(retentionRunClassFields) }),
    [LEGAL_HOLD_RESOURCE]: hasuraTable('legal_holds', { selectFields: selectFieldsOf(legalHoldFields), orderByField: 'starts_at' }),
    ...targetTables,
  },
  operations: [setPolicyActiveOperation, deletePolicyOperation, retentionPlanOperation, endHoldOperation, holdNoticeOperation],
} as const satisfies ConsoleModule;
