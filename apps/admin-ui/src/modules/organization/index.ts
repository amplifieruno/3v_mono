import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import type { ConsoleModule } from '../module';
import { COMPANY_RESOURCE, company, companyFields } from './companies';
import {
  CUSTOM_ATTRIBUTE_RESOURCE,
  customAttributeDefinition,
  customAttributeFields,
} from './custom-attributes';
import { invitationTokenBlock } from './invitation-token-block';
import { INVITATION_RESOURCE, invitationFields, organizationInvitation } from './invitations';
import { inviteMember, inviteMemberOperation } from './invite-member';
import { MEMBER_RESOURCE, memberFields, organizationMember } from './members';
import { ORGANIZATION_RESOURCE, organization, organizationFields } from './organization';
import { preferencesBlock, preferencesPage } from './preferences-page';
import { organizationProfileBlock, organizationProfilePage } from './profile-page';
import { SETTINGS_RESOURCE, organizationSettings, settingsFields } from './settings';
import { organizationSettingsBlock, organizationSettingsPage } from './settings-page';
import { USER_RESOURCE, user, userFields } from './user';
import { USER_SETTINGS_RESOURCE, userSettings, userSettingsFields } from './user-settings';
import { WORK_SCHEDULE_RESOURCE, workSchedule, workScheduleFields } from './work-schedules';

/**
 * Organization: the profile and settings pages of the current organization, members,
 * invitations (the `invite_member` flow and its one-time token), the read-only
 * sign-in accounts they point at, companies, work schedules, custom attribute
 * definitions and the signed-in user's own preferences.
 */
export const organizationModule = {
  name: 'organization-module',
  uses: [
    organization,
    organizationMember,
    organizationInvitation,
    user,
    organizationProfilePage,
    organizationProfileBlock,
    invitationTokenBlock,
    inviteMember,
    organizationSettings,
    organizationSettingsPage,
    organizationSettingsBlock,
    company,
    workSchedule,
    customAttributeDefinition,
    userSettings,
    preferencesPage,
    preferencesBlock,
  ],
  tables: {
    [ORGANIZATION_RESOURCE]: hasuraTable('organizations', {
      selectFields: selectFieldsOf(organizationFields),
    }),
    [MEMBER_RESOURCE]: hasuraTable('organization_members', {
      selectFields: selectFieldsOf(memberFields),
    }),
    [INVITATION_RESOURCE]: hasuraTable('organization_invitations', {
      selectFields: selectFieldsOf(invitationFields),
    }),
    /**
     * `auth.users` (Nhost): camelCase columns, custom root names (`user` by pk),
     * no `created_at` and no aggregate for `org_admin`.
     */
    [USER_RESOURCE]: hasuraTable('users', {
      selectFields: selectFieldsOf(userFields),
      byPkRoot: 'user',
      aggregate: false,
      orderByField: 'displayName',
    }),
    /** One row per organization, keyed by `organization_id` (no `id`). */
    [SETTINGS_RESOURCE]: hasuraTable('organization_settings', {
      selectFields: selectFieldsOf(settingsFields),
      pkField: 'organization_id',
    }),
    [COMPANY_RESOURCE]: hasuraTable('companies', { selectFields: selectFieldsOf(companyFields) }),
    [WORK_SCHEDULE_RESOURCE]: hasuraTable('work_schedules', {
      selectFields: selectFieldsOf(workScheduleFields),
    }),
    [CUSTOM_ATTRIBUTE_RESOURCE]: hasuraTable('custom_attribute_definitions', {
      selectFields: selectFieldsOf(customAttributeFields),
    }),
    /** The signed-in user's own row (Hasura filters by `X-Hasura-User-Id`), keyed by `user_id`. */
    [USER_SETTINGS_RESOURCE]: hasuraTable('user_settings', {
      selectFields: selectFieldsOf(userSettingsFields),
      pkField: 'user_id',
    }),
  },
  operations: [inviteMemberOperation],
} as const satisfies ConsoleModule;
