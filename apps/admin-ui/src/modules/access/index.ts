import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import {
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
} from '../../data/resource-names';
import type { ConsoleModule } from '../module';
import { accessNamesOperation, accessNamesQuery } from './access-names-query';
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
import { simulationBlock } from './simulation-block';
import { simulateAccessPolicy, simulateAccessPolicyOperation } from './simulation-query';
import { accessPolicyVersionContent, versionContentOperation } from './version-content-query';
import { versionReviewBlock } from './version-review-block';

const versions = { selectFields: selectFieldsOf(accessPolicyVersionFields), orderByField: 'version' } as const;

/**
 * Access control: access policies (who may pass which doors, when) with their versions, each
 * naming subjects (people, segments, profile types, minimum access levels) and targets
 * (facilities, areas, access points); a draft is submitted and approved by a second member
 * (four-eyes) before it goes in force, rejected with a reason, rolled back by copying an earlier
 * version, or tried against the doors' past decisions first (simulation, writes nothing); and the
 * policy analytics page.
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
  },
  operations: [
    ...POLICY_OPERATIONS,
    versionContentOperation,
    simulateAccessPolicyOperation,
    accessNamesOperation,
    policyAnalyticsOperation,
  ],
} as const satisfies ConsoleModule;
