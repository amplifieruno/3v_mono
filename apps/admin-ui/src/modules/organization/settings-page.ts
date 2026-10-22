import { defineBlock, defineCustomPage } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';

/**
 * The body of the settings page: the record screen of the current
 * organization's settings row (`./organization-settings-view.tsx`), keyed by the
 * organization id. Same shape as the profile page (gap G13).
 */
export const organizationSettingsBlock = defineBlock('itap:organization-settings', {
  texts: 'Organization settings',
});

/** "Settings" in the sidebar: the current organization's settings, editable in place. */
export const organizationSettingsPage = defineCustomPage({
  name: 'organization-settings',
  icon: NAV_ICONS.settings,
  path: '/organization-settings',
  texts: 'Settings',
  section: NAV_SECTIONS.organization,
  order: 40,
  body: (l) => [l.place(organizationSettingsBlock, { key: 'settings' })],
});
