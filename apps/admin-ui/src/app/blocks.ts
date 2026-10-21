import { defineBlock } from '@burojs/core';

/*
 * The app's own blocks (module blocks live in their module and register with
 * it); `./block-implementations.ts` gives each its view. The page route
 * renders the page label as the heading, so no view has its own.
 */

/** The `help` page body: the framework's documentation browser. */
export const helpBlock = defineBlock('itap:help', { texts: 'Help' });
