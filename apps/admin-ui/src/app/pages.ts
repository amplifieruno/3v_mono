import { defineCustomPage } from '@burojs/core';
import { dashboardBlock, helpBlock } from './blocks';
import { NAV_ICONS, NAV_SECTIONS } from './nav';

/** The landing page. Its body is filled by the dashboard task. */
export const dashboardPage = defineCustomPage({
  name: 'dashboard',
  icon: NAV_ICONS.dashboard,
  path: '/dashboard',
  texts: 'Dashboard',
  section: NAV_SECTIONS.overview,
  order: 0,
  body: (l) => [l.place(dashboardBlock, { key: 'dashboard' })],
});

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
