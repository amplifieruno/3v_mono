import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import {
  ACCESS_DECISION_RESOURCE,
  ACCESS_GRANT_RESOURCE,
  ACCESS_POLICY_ACCESS_LEVEL_SUBJECT_RESOURCE,
  ACCESS_POLICY_ACCESS_POINT_TARGET_RESOURCE,
  ACCESS_POLICY_AREA_TARGET_RESOURCE,
  ACCESS_POLICY_FACILITY_TARGET_RESOURCE,
  ACCESS_POLICY_PROFILE_SUBJECT_RESOURCE,
  ACCESS_POLICY_PROFILE_TYPE_SUBJECT_RESOURCE,
  ACCESS_POLICY_RESOURCE,
  ACCESS_POLICY_SEGMENT_SUBJECT_RESOURCE,
  ACCESS_POLICY_SUBJECT_RESOURCE,
  ACCESS_POLICY_TARGET_RESOURCE,
  ACCESS_POLICY_VERSION_RESOURCE,
  EMERGENCY_OVERRIDE_AREA_RESOURCE,
  EMERGENCY_OVERRIDE_RESOURCE,
  TERMINAL_POLICY_SYNC_RESOURCE,
} from '../../data/resource-names';
import type { ConsoleModule } from '../module';
import { accessNamesOperation, accessNamesQuery } from './access-names-query';
import { accessDecision } from './decision';
import { accessDecisionFields } from './decision-fields';
import { decisionTraceBlock } from './decision-trace-block';
import { accessDecisionTrace, accessTraceNames, decisionTraceOperation, traceNamesOperation } from './decision-trace-query';
import { accessGrant } from './grant';
import { accessGrantFields } from './grant-fields';
import { GRANT_MUTATIONS, GRANT_OPERATIONS } from './grant-ops';
import { emergencyOverride, emergencyOverrideFields } from './override';
import { emergencyOverrideArea, emergencyOverrideAreaFields } from './override-area';
import { OVERRIDE_MUTATIONS, OVERRIDE_OPERATIONS } from './override-ops';
import { accessPolicy } from './policy';
import { policyAnalyticsBlock } from './policy-analytics-block';
import { policyAnalyticsPage } from './policy-analytics-page';
import { policyAnalyticsOperation, policyAnalyticsQuery } from './policy-analytics-query';
import { accessPolicyFields } from './policy-fields';
import { POLICY_MUTATIONS, POLICY_OPERATIONS } from './policy-ops';
import {
  accessLevelSubject,
  accessLevelSubjectFields,
  policySubject,
  policySubjectFields,
  profileSubject,
  profileSubjectFields,
  profileTypeSubject,
  profileTypeSubjectFields,
  segmentSubject,
  segmentSubjectFields,
} from './policy-subjects';
import {
  accessPointTarget,
  accessPointTargetFields,
  areaTarget,
  areaTargetFields,
  facilityTarget,
  facilityTargetFields,
  policyTarget,
  policyTargetFields,
} from './policy-targets';
import { accessPolicyVersion } from './policy-version';
import { accessPolicyVersionFields } from './policy-version-fields';
import { publishResultBlock } from './publish-result-block';
import { simulationBlock } from './simulation-block';
import { TERMINAL_OPERATIONS, TERMINAL_QUERIES } from './terminal-ops';
import { terminalPolicySync, terminalPolicySyncFields } from './terminal-sync';
import { terminalSyncBlock } from './terminal-sync-block';
import { publishPolicyAction, terminalsPage } from './terminals-page';
import { simulateAccessPolicy, simulateAccessPolicyOperation } from './simulation-query';
import { accessPolicyVersionContent, versionContentOperation } from './version-content-query';
import { versionReviewBlock } from './version-review-block';

// `policy { is_archived }`: the version rules read it (no edit, submit or roll back on an archived policy).
const versions = { selectFields: [...selectFieldsOf(accessPolicyVersionFields), 'policy { is_archived }'], orderByField: 'version' };

/**
 * Access control: access policies (who may pass which doors, when) with their versions, each
 * naming subjects (people, segments, profile types, minimum access levels) and targets
 * (facilities, areas, access points); a draft is submitted and approved by a second member
 * (four-eyes) before it goes in force, rejected with a reason, rolled back by copying an earlier
 * version, or tried against the doors' past decisions first (simulation, writes nothing); the
 * policy analytics page; access grants (revoked with a reason, never edited); the access decision
 * log with each decision's trace and "Test access" on an access point; emergency overrides
 * (started with a justification, ended early with a reason, each terminal's pick-up shown); the
 * terminals' policy sync (Terminals page, device pages, the sync log) and "Publish policy to
 * terminals".
 */
export const accessModule = {
  name: 'access-module',
  uses: [
    accessPolicy,
    accessPolicyVersion,
    policySubject,
    profileSubject,
    segmentSubject,
    profileTypeSubject,
    accessLevelSubject,
    policyTarget,
    facilityTarget,
    areaTarget,
    accessPointTarget,
    ...POLICY_MUTATIONS,
    accessPolicyVersionContent,
    versionReviewBlock,
    simulateAccessPolicy,
    accessNamesQuery,
    simulationBlock,
    policyAnalyticsQuery,
    policyAnalyticsBlock,
    policyAnalyticsPage,
    accessGrant,
    accessDecision,
    emergencyOverride,
    emergencyOverrideArea,
    ...OVERRIDE_MUTATIONS,
    terminalPolicySync,
    ...TERMINAL_QUERIES,
    terminalSyncBlock,
    publishResultBlock,
    publishPolicyAction,
    terminalsPage,
    ...GRANT_MUTATIONS,
    accessDecisionTrace,
    accessTraceNames,
    decisionTraceBlock,
  ],
  tables: {
    [ACCESS_POLICY_RESOURCE]: hasuraTable('access_policies', { selectFields: selectFieldsOf(accessPolicyFields) }),
    [ACCESS_POLICY_VERSION_RESOURCE]: hasuraTable('access_policy_versions', versions),
    // One table, five resources (G45): every subject read only, and one per kind for a draft.
    [ACCESS_POLICY_SUBJECT_RESOURCE]: hasuraTable('access_policy_version_subjects', { selectFields: selectFieldsOf(policySubjectFields) }),
    [ACCESS_POLICY_PROFILE_SUBJECT_RESOURCE]: hasuraTable('access_policy_version_subjects', {
      selectFields: selectFieldsOf(profileSubjectFields),
    }),
    [ACCESS_POLICY_SEGMENT_SUBJECT_RESOURCE]: hasuraTable('access_policy_version_subjects', {
      selectFields: selectFieldsOf(segmentSubjectFields),
    }),
    [ACCESS_POLICY_PROFILE_TYPE_SUBJECT_RESOURCE]: hasuraTable('access_policy_version_subjects', {
      selectFields: selectFieldsOf(profileTypeSubjectFields),
    }),
    [ACCESS_POLICY_ACCESS_LEVEL_SUBJECT_RESOURCE]: hasuraTable('access_policy_version_subjects', {
      selectFields: selectFieldsOf(accessLevelSubjectFields),
    }),
    [ACCESS_POLICY_TARGET_RESOURCE]: hasuraTable('access_policy_version_targets', { selectFields: selectFieldsOf(policyTargetFields) }),
    [ACCESS_POLICY_FACILITY_TARGET_RESOURCE]: hasuraTable('access_policy_version_targets', {
      selectFields: selectFieldsOf(facilityTargetFields),
    }),
    [ACCESS_POLICY_AREA_TARGET_RESOURCE]: hasuraTable('access_policy_version_targets', { selectFields: selectFieldsOf(areaTargetFields) }),
    [ACCESS_POLICY_ACCESS_POINT_TARGET_RESOURCE]: hasuraTable('access_policy_version_targets', {
      selectFields: selectFieldsOf(accessPointTargetFields),
    }),
    [ACCESS_GRANT_RESOURCE]: hasuraTable('access_grants', { selectFields: selectFieldsOf(accessGrantFields) }),
    // Append-only log: keyset paging, no count on every page.
    [ACCESS_DECISION_RESOURCE]: hasuraTable('access_decisions', {
      selectFields: selectFieldsOf(accessDecisionFields),
      orderByField: 'decided_at',
      noAggregate: true,
    }),
    [EMERGENCY_OVERRIDE_RESOURCE]: hasuraTable('emergency_overrides', {
      selectFields: selectFieldsOf(emergencyOverrideFields),
      orderByField: 'started_at',
    }),
    [EMERGENCY_OVERRIDE_AREA_RESOURCE]: hasuraTable('emergency_override_areas', { selectFields: selectFieldsOf(emergencyOverrideAreaFields) }),
    // Append-only log: keyset paging, no count on every page.
    [TERMINAL_POLICY_SYNC_RESOURCE]: hasuraTable('terminal_policy_syncs', {
      selectFields: selectFieldsOf(terminalPolicySyncFields),
      orderByField: 'created_at',
      noAggregate: true,
    }),
  },
  operations: [
    ...POLICY_OPERATIONS,
    ...GRANT_OPERATIONS,
    ...OVERRIDE_OPERATIONS,
    ...TERMINAL_OPERATIONS,
    decisionTraceOperation,
    traceNamesOperation,
    versionContentOperation,
    simulateAccessPolicyOperation,
    accessNamesOperation,
    policyAnalyticsOperation,
  ],
} as const satisfies ConsoleModule;
