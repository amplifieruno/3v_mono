import { composeBlockImplementations, implementBlock } from '@burojs/react';
import { MODULE_VIEWS } from '../modules/views';
import { helpBlock } from './blocks';
import { HelpPage } from './help-page';

/** The views of the app's and the modules' blocks, handed to `<BuroProvider blockImplementations>`. */
export const appBlockImplementations = composeBlockImplementations(
  implementBlock(helpBlock, { component: HelpPage }),
  ...MODULE_VIEWS,
);
