import { defineBlock } from '@burojs/core';

/*
 * The custom pages' content as blocks. Each page body (`./pages.ts`) places one;
 * `./block-implementations.ts` gives each its view. The page route renders the
 * page label as the heading, so no view has its own.
 */

/** The `dashboard` page body. Empty until the dashboard KPIs land. */
export const dashboardBlock = defineBlock('itap:dashboard', {
  texts: 'Dashboard',
});

/** The `help` page body: the framework's documentation browser. */
export const helpBlock = defineBlock('itap:help', { texts: 'Help' });

export const APP_BLOCKS = [dashboardBlock, helpBlock] as const;
