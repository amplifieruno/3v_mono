import { implementBlock } from '@burojs/react';
import { invitationTokenBlock } from './invitation-token-block';
import { InvitationTokenView } from './invitation-token-view';
import { OrganizationProfileView } from './organization-profile-view';
import { organizationProfileBlock } from './profile-page';
import { OrganizationSettingsView } from './organization-settings-view';
import { preferencesBlock } from './preferences-page';
import { PreferencesView } from './preferences-view';
import { organizationSettingsBlock } from './settings-page';

/** The views of the organization module's blocks (kept apart from `./index.ts`, which stays React-free). */
export const organizationViews = [
  implementBlock(invitationTokenBlock, { component: InvitationTokenView }),
  implementBlock(organizationProfileBlock, { component: OrganizationProfileView }),
  implementBlock(organizationSettingsBlock, { component: OrganizationSettingsView }),
  implementBlock(preferencesBlock, { component: PreferencesView }),
] as const;
