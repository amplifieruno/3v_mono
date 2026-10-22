import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import type { ConsoleModule } from '../module';
import { invitationTokenBlock } from './invitation-token-block';
import { INVITATION_RESOURCE, invitationFields, organizationInvitation } from './invitations';
import { inviteMember, inviteMemberOperation } from './invite-member';
import { MEMBER_RESOURCE, memberFields, organizationMember } from './members';
import { ORGANIZATION_RESOURCE, organization, organizationFields } from './organization';
import { organizationProfileBlock, organizationProfilePage } from './profile-page';
import { SETTINGS_RESOURCE, organizationSettings, settingsFields } from './settings';
import { organizationSettingsBlock, organizationSettingsPage } from './settings-page';
import { USER_RESOURCE, user, userFields } from './user';

/**
 * Organization: the profile and settings pages of the current organization, members,
 * invitations (the `invite_member` flow and its one-time token) and the
 * read-only sign-in accounts they point at.
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
  },
  operations: [inviteMemberOperation],
} as const satisfies ConsoleModule;
