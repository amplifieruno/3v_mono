import type { EnumDef } from '@burojs/core';
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
];

/** Registered enums that are console-only choices of a form, with no Hasura enum table. */
export const CONSOLE_ONLY_ENUMS: ReadonlySet<string> = new Set([MERGE_KEEP_ENUM, IDENTITY_MERGE_KEEP_ENUM]);

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
};
