import { defineBlock } from '@burojs/core';
import { invitationTokenBlock } from '../modules/organization/invitation-token-block';

/*
 * The app's own blocks: custom page content (`./pages.ts`) and what flows open
 * (`then.open`); `./block-implementations.ts` gives each its view. The page
 * route renders the page label as the heading, so no view has its own.
 */

/** The `help` page body: the framework's documentation browser. */
export const helpBlock = defineBlock('itap:help', { texts: 'Help' });

/** Every app block, registered under one contribution id. */
export const APP_BLOCKS = [helpBlock, invitationTokenBlock] as const;
