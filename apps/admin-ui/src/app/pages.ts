import { defineCustomPage } from '@burojs/core';
import { helpBlock } from './blocks';
import { NAV_ICONS } from './nav';

/**
 * The handbook: every documented scope and the glossary, through the
 * framework's `<DocBrowser>`. Last in the sidebar.
 */
export const helpPage = defineCustomPage({
  name: 'help',
  icon: NAV_ICONS.help,
  path: '/help',
  texts: 'Help',
  order: 1000,
  body: (l) => [l.place(helpBlock, { key: 'help' })],
});
