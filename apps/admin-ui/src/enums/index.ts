import type { EnumDef } from '@burojs/core';
import { facilityStatusEnum, PLACES_ENUM_TABLES } from './places';
import {
  invitationStatusEnum,
  memberRoleEnum,
  memberStatusEnum,
  organizationStatusEnum,
  TENANCY_ENUM_TABLES,
} from './tenancy';

/** Every enum the console registers (`app-definition.ts` uses each by its name). */
export const ITAP_ENUMS: readonly EnumDef[] = [
  organizationStatusEnum,
  memberRoleEnum,
  memberStatusEnum,
  invitationStatusEnum,
  facilityStatusEnum,
];

/**
 * Registered enum name → the Hasura enum table holding its values. The schema
 * contract test fails for a registered enum missing here.
 */
export const ENUM_TABLES: Readonly<Record<string, string>> = {
  ...TENANCY_ENUM_TABLES,
  ...PLACES_ENUM_TABLES,
};
