import type { EnumDef } from '@burojs/core';
import {
  ACCESS_ENUM_TABLES,
  accessDecisionReasonEnum,
  accessDecisionResultEnum,
  accessEffectEnum,
  accessPolicyVersionStatusEnum,
} from './access';
import {
  DEVICES_ENUM_TABLES,
  deviceEventKindEnum,
  deviceHealthEnum,
  deviceStatusEnum,
  deviceTypeEnum,
} from './devices';
import {
  companyKindEnum,
  companyStatusEnum,
  customAttributeEntityEnum,
  customAttributeTypeEnum,
  ORGANIZATION_ENUM_TABLES,
} from './organization';
import {
  accessPointDeviceRoleEnum,
  accessPointDirectionEnum,
  accessPointKindEnum,
  areaAccessLevelEnum,
  areaStatusEnum,
  areaTypeEnum,
  facilityStatusEnum,
  PLACES_ENUM_TABLES,
} from './places';
import {
  IDENTITY_ENUM_TABLES,
  identityPhotoKindEnum,
  identitySourceEnum,
  identityStatusEnum,
} from './identities';
import {
  IDENTITY_GOVERNANCE_ENUM_TABLES,
  IDENTITY_MERGE_KEEP_ENUM,
  identityMergeKeepEnum,
  identityRelationEnum,
  mergeStatusEnum,
  verificationStatusEnum,
} from './identity-governance';
import { accessLevelEnum, PEOPLE_ENUM_TABLES, profileStatusEnum, profileTypeEnum } from './people';
import {
  candidateStatusEnum,
  consentMethodEnum,
  consentPurposeEnum,
  consentStatusEnum,
  documentKindEnum,
  MERGE_KEEP_ENUM,
  mergeKeepEnum,
  PEOPLE_RECORD_ENUM_TABLES,
} from './people-records';
import {
  invitationStatusEnum,
  memberRoleEnum,
  memberStatusEnum,
  organizationStatusEnum,
  TENANCY_ENUM_TABLES,
} from './tenancy';
import { MONITORING_ENUM_TABLES, movementTypeEnum, trackingSessionStatusEnum } from './monitoring';
import { VISIT_ENUM_TABLES, visitStatusEnum } from './visits';
import {
  EVENT_ENUM_TABLES,
  eventRuleTypeEnum,
  eventSeverityEnum,
  incidentStatusEnum,
  versionStatusEnum,
} from './events';
import { eventTypeEnum } from './event-types';
import {
  INCIDENT_ENUM_TABLES,
  incidentActivityKindEnum,
  incidentDispositionEnum,
  incidentIdentityRoleEnum,
  reportFormatEnum,
} from './incidents';
import { WATCH_LIST_ENUM_TABLES, watchListKindEnum } from './watch-lists';
import {
  ADDRESS_CHANNEL_ENUM,
  NOTIFICATION_DELIVERY_ORIGIN_ENUM,
  NOTIFICATION_ENUM_TABLES,
  PERSON_CHANNEL_ENUM,
  addressChannelEnum,
  notificationChannelEnum,
  notificationDeliveryOriginEnum,
  notificationDeliveryStatusEnum,
  notificationDigestModeEnum,
  notificationPriorityEnum,
  personChannelEnum,
  webhookDeliveryStatusEnum,
} from './notifications';
import {
  SEGMENT_ENUM_TABLES,
  segmentKindEnum,
  segmentMemberSourceEnum,
  segmentStatusEnum,
  segmentTargetEnum,
} from './segments';
import {
  REPORT_CHANNEL_ENUM,
  REPORT_ENUM_TABLES,
  REPORT_PERIOD_ENUM,
  reportChannelEnum,
  reportPeriodEnum,
  reportStatusEnum,
  reportTypeEnum,
} from './reports';
import {
  SAVED_SEARCH_RUN_STATUS_ENUM,
  SEARCH_ENUM_TABLES,
  SEARCH_GENDER_ENUM,
  SEARCH_LINKED_ENUM,
  searchGenderEnum,
  savedSearchRunStatusEnum,
  searchLinkedEnum,
  searchMatchTypeEnum,
  searchStatusEnum,
  searchTypeEnum,
} from './search';
import {
  BULK_ENUM_TABLES,
  BULK_UPDATE_KEY_ENUM,
  bulkJobKindEnum,
  bulkJobRowOutcomeEnum,
  bulkJobStatusEnum,
  bulkUpdateKeyEnum,
} from './bulk';

/** Every enum the console registers (`app-definition.ts` uses each by its name). */
export const ITAP_ENUMS: readonly EnumDef[] = [
  organizationStatusEnum,
  memberRoleEnum,
  memberStatusEnum,
  invitationStatusEnum,
  companyKindEnum,
  companyStatusEnum,
  customAttributeEntityEnum,
  customAttributeTypeEnum,
  facilityStatusEnum,
  areaTypeEnum,
  areaAccessLevelEnum,
  areaStatusEnum,
  accessPointKindEnum,
  accessPointDirectionEnum,
  accessPointDeviceRoleEnum,
  deviceTypeEnum,
  deviceStatusEnum,
  deviceHealthEnum,
  deviceEventKindEnum,
  profileTypeEnum,
  profileStatusEnum,
  accessLevelEnum,
  documentKindEnum,
  consentPurposeEnum,
  consentStatusEnum,
  consentMethodEnum,
  candidateStatusEnum,
  mergeKeepEnum,
  identityStatusEnum,
  identitySourceEnum,
  identityPhotoKindEnum,
  mergeStatusEnum,
  verificationStatusEnum,
  identityRelationEnum,
  identityMergeKeepEnum,
  visitStatusEnum,
  trackingSessionStatusEnum,
  movementTypeEnum,
  eventSeverityEnum,
  eventTypeEnum,
  eventRuleTypeEnum,
  versionStatusEnum,
  incidentStatusEnum,
  incidentDispositionEnum,
  incidentActivityKindEnum,
  incidentIdentityRoleEnum,
  reportFormatEnum,
  watchListKindEnum,
  notificationChannelEnum,
  notificationPriorityEnum,
  notificationDigestModeEnum,
  notificationDeliveryStatusEnum,
  notificationDeliveryOriginEnum,
  personChannelEnum,
  addressChannelEnum,
  webhookDeliveryStatusEnum,
  segmentKindEnum,
  segmentTargetEnum,
  segmentStatusEnum,
  segmentMemberSourceEnum,
  reportTypeEnum,
  reportStatusEnum,
  reportChannelEnum,
  reportPeriodEnum,
  searchTypeEnum,
  searchStatusEnum,
  searchMatchTypeEnum,
  searchGenderEnum,
  searchLinkedEnum,
  savedSearchRunStatusEnum,
  bulkJobKindEnum,
  bulkJobStatusEnum,
  bulkJobRowOutcomeEnum,
  bulkUpdateKeyEnum,
  accessEffectEnum,
  accessPolicyVersionStatusEnum,
  accessDecisionResultEnum,
  accessDecisionReasonEnum,
];

/** Registered enums that are console-only choices of a form, with no Hasura enum table. */
export const CONSOLE_ONLY_ENUMS: ReadonlySet<string> = new Set([
  MERGE_KEEP_ENUM,
  IDENTITY_MERGE_KEEP_ENUM,
  // The computed `notification_deliveries.origin` (which origin column is set), not a table.
  NOTIFICATION_DELIVERY_ORIGIN_ENUM,
  // Subsets of notification_channels for the channel pickers (G52).
  PERSON_CHANNEL_ENUM,
  ADDRESS_CHANNEL_ENUM,
  // The channels a report schedule delivers on (G52), and a template's `parameters.period` (a jsonb key).
  REPORT_CHANNEL_ENUM,
  REPORT_PERIOD_ENUM,
  // Keys of a search's filters (`itap.valid_search_filters`), not tables.
  SEARCH_GENDER_ENUM,
  SEARCH_LINKED_ENUM,
  // `saved_searches.last_run_status` (a CHECK constraint).
  SAVED_SEARCH_RUN_STATUS_ENUM,
  // `bulk_jobs.options.update_key` (a jsonb key checked by `itap.valid_bulk_job_options`).
  BULK_UPDATE_KEY_ENUM,
]);

/**
 * Registered enum name → the Hasura enum table holding its values. The schema
 * contract test fails for a registered enum missing here (except `CONSOLE_ONLY_ENUMS`).
 */
export const ENUM_TABLES: Readonly<Record<string, string>> = {
  ...TENANCY_ENUM_TABLES,
  ...ORGANIZATION_ENUM_TABLES,
  ...PLACES_ENUM_TABLES,
  ...DEVICES_ENUM_TABLES,
  ...PEOPLE_ENUM_TABLES,
  ...PEOPLE_RECORD_ENUM_TABLES,
  ...IDENTITY_ENUM_TABLES,
  ...IDENTITY_GOVERNANCE_ENUM_TABLES,
  ...VISIT_ENUM_TABLES,
  ...MONITORING_ENUM_TABLES,
  ...EVENT_ENUM_TABLES,
  ...INCIDENT_ENUM_TABLES,
  ...WATCH_LIST_ENUM_TABLES,
  ...NOTIFICATION_ENUM_TABLES,
  ...SEGMENT_ENUM_TABLES,
  ...REPORT_ENUM_TABLES,
  ...SEARCH_ENUM_TABLES,
  ...BULK_ENUM_TABLES,
  ...ACCESS_ENUM_TABLES,
};
