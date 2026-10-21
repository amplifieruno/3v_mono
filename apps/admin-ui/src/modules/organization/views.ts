import { implementBlock } from '@burojs/react';
import { invitationTokenBlock } from './invitation-token-block';
import { InvitationTokenView } from './invitation-token-view';
import { OrganizationProfileView } from './organization-profile-view';
import { organizationProfileBlock } from './profile-page';

/** The views of the organization module's blocks (kept apart from `./index.ts`, which stays React-free). */
export const organizationViews = [
  implementBlock(invitationTokenBlock, { component: InvitationTokenView }),
  implementBlock(organizationProfileBlock, { component: OrganizationProfileView }),
] as const;
