import { defineCustomPage } from '@burojs/core';
import { dashboardBody } from '../modules/overview/dashboard';
import { helpBlock } from './blocks';
import { NAV_ICONS, NAV_SECTIONS } from './nav';

/** The landing page: the organization's headline figures (`../modules/overview/dashboard.ts`). */
export const dashboardPage = defineCustomPage({
  name: 'dashboard',
  icon: NAV_ICONS.dashboard,
  path: '/dashboard',
  texts: 'Dashboard',
  section: NAV_SECTIONS.overview,
  order: 0,
  body: dashboardBody,
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
