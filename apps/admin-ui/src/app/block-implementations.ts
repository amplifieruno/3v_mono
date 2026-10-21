import { composeBlockImplementations, implementBlock } from '@burojs/react';
import { invitationTokenBlock } from '../modules/organization/invitation-token-block';
import { InvitationTokenView } from '../modules/organization/invitation-token-view';
import { helpBlock } from './blocks';
import { HelpPage } from './help-page';

/** The views of the app's own blocks, handed to `<BuroProvider blockImplementations>`. */
export const appBlockImplementations = composeBlockImplementations(
  implementBlock(helpBlock, { component: HelpPage }),
  implementBlock(invitationTokenBlock, { component: InvitationTokenView }),
);
